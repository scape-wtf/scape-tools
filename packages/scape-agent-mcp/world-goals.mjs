import { GRID } from './contracts.mjs';
export const distance = (a, b) =>
  a?.floor === b?.floor ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : Infinity;
const arrows = new Set(['➡️', '⬇️', '⬅️', '⬆️']);
const conveyor = o => !o.isEntry && arrows.has(o.conveyorEmoji ?? o.emoji);
const fail = code =>
  Object.assign(new Error('The requested object is not currently reachable or usable.'), { code });
export function usable(object, scene) {
  if (!object || (object.floor ?? 0) !== (scene?.floor ?? 0)) return false;
  if (conveyor(object) || (object.emoji === '🎹' && !object.isEntry)) return true;
  if (object.emoji === '🌀')
    return (
      !!object.portalPairId &&
      scene.objects.filter(
        o =>
          o.emoji === '🌀' &&
          o.portalPairId === object.portalPairId &&
          (o.floor ?? 0) === (object.floor ?? 0),
      ).length === 2
    );
  return (
    !!scene?.hasBasement &&
    ((object.emoji === '🕳️' && (object.floor ?? 0) === 0) ||
      (object.emoji === '🪜' && object.isEntry && (object.floor ?? 0) === 1))
  );
}
/** Find a reachable standing cell, not just a geometrically adjacent destination. */
export function objectDestination(state, object, canStand = () => true) {
  const self = state.self,
    floor = object.floor ?? self?.floor;
  if (!self || floor !== self.floor) return undefined;
  const objects = (state.scene?.objects ?? state.objects).filter(o => (o.floor ?? floor) === floor);
  const blocked = new Set(state.scene?.blocked ?? []);
  for (const p of [
    ...state.blocked,
    ...objects,
    ...(state.roster ?? state.players).filter(p => p.floor === floor),
  ])
    blocked.add(p.y * GRID.width + p.x);
  const origin = self.y * GRID.width + self.x;
  blocked.delete(origin);
  // A conveyor can be boarded at a reachable segment in its connected chain.
  const targets = [object];
  if (conveyor(object) && object.emoji !== '🎹')
    for (let i = 0; i < targets.length; i++)
      for (const next of objects)
        if (
          conveyor(next) &&
          !targets.includes(next) &&
          Math.abs(next.x - targets[i].x) + Math.abs(next.y - targets[i].y) === 1
        )
          targets.push(next);
  const adjacent = new Map();
  for (const target of targets)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = target.x + dx,
        y = target.y + dy;
      if (x >= 0 && y >= 0 && x < GRID.width && y < GRID.height)
        adjacent.set(y * GRID.width + x, target);
    }
  const queue = [origin],
    seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i],
      x = cell % GRID.width,
      y = Math.floor(cell / GRID.width);
    if (adjacent.has(cell) && canStand(x, y)) return { x, y, floor, object: adjacent.get(cell) };
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        key = ny * GRID.width + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= GRID.width ||
        ny >= GRID.height ||
        blocked.has(key) ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      queue.push(key);
    }
  }
}
/** One bounded, cancellable goal. Arrival always comes from a fresh observation. */
export function createObjectGoals({ context, now, call, canStand }) {
  let goal,
    inspectUntil = 0;
  const visited = new Map();
  const mark = id => {
    visited.set(id, now());
    while (visited.size > 128) visited.delete(visited.keys().next().value);
  };
  return {
    get current() {
      return goal;
    },
    get busy() {
      return !!goal || now() < inspectUntil;
    },
    seen(id) {
      return now() - (visited.get(id) ?? -Infinity) < 300000;
    },
    clear() {
      goal = undefined;
      inspectUntil = 0;
    },
    due() {
      return !!goal && now() >= goal.expiresAt;
    },
    async start(target, use, player, tools) {
      goal = undefined;
      inspectUntil = 0;
      const state = context.observation,
        object = state.scene?.objects.find(o => o.id === target);
      if (!object) throw fail('stale_target');
      if (use && !usable(object, state.scene)) throw fail('interaction_unavailable');
      const destination = objectDestination(state, object, canStand);
      if (!destination) throw fail('target_unreachable');
      const next = {
        target: destination.object.id,
        requested: target,
        use,
        player,
        floor: state.self.floor,
        expiresAt: now() + 45000,
      };
      goal = next;
      if (distance(state.self, destination) > 0) {
        try {
          const result = await call(
            'scape_move_to',
            { x: destination.x, y: destination.y, floor: destination.floor },
            tools,
          );
          if (goal === next) next.operation = result.operationId;
        } catch (error) {
          if (goal === next) goal = undefined;
          throw error;
        }
      } else await this.advance(tools);
      return {
        ok: true,
        goal: { target, use, status: goal ? 'moving' : use ? 'used' : 'inspecting' },
      };
    },
    async advance(tools) {
      if (!goal) return now() < inspectUntil;
      const current = goal,
        state = context.observation;
      const object = state.scene?.objects.find(o => o.id === current.target);
      const ownMovement = !!current.operation && state.movement?.id === current.operation;
      const cancel = async () => {
        this.clear();
        if (
          ownMovement &&
          state.movement.status === 'moving' &&
          state.self?.floor === current.floor
        )
          await call('scape_stop', {}, tools);
      };
      if (current.player && !(state.roster ?? state.players).some(p => p.id === current.player)) {
        await cancel();
        return false;
      }
      if (!object || state.self?.floor !== current.floor) {
        await cancel();
        throw fail('stale_target');
      }
      if (current.operation && state.movement && state.movement.id !== current.operation) {
        this.clear();
        return false;
      }
      if (
        now() >= current.expiresAt ||
        (ownMovement &&
          ['blocked', 'timed_out', 'stopped', 'disconnected'].includes(state.movement.status))
      ) {
        await cancel();
        throw fail('target_unreachable');
      }
      if (
        distance(state.self, { ...object, floor: object.floor ?? current.floor }) === 1 &&
        state.movement?.status !== 'moving'
      ) {
        goal = undefined;
        if (current.use) {
          if (!usable(object, state.scene)) throw fail('interaction_unavailable');
          await call('scape_interact', { target: object.id }, tools);
        }
        mark(current.requested);
        inspectUntil = now() + 3000;
        return true;
      }
      return true;
    },
  };
}
