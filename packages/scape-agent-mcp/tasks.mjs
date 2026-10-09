import { AGENT_BUILDING_ENABLED } from './contracts.mjs';
import { compileTask, invalidPlan, taskStepSchema } from './task-plans.mjs';

const creativeTaskTool = {
  name: 'agent_task',
  description:
    'Queue a complete creative or physical plan requested by the current speaker. For mazes, prefer action maze with odd width/height and an emoji (default 🧱); omit x/y to find nearby empty space automatically. It generates connected paths and entrance/exit. Build other large structures with compact tile-map rows and a palette; palette entries can configure piano notes or other objects. place adds one configured tile; use/visit/approach/express perform observed actions; wait adds a rest. Queue all work, not just one sample object. Up to 4096 expanded steps run over time without further model calls, paced to current limits. Progress is retained in this connection; stops, departure and reconnect cancel unfinished work. Acceptance is not completion.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['steps'],
    properties: {
      steps: { type: 'array', minItems: 1, maxItems: 512, items: taskStepSchema },
    },
  },
};
// Retain the experiment for later; only physical actions are advertised today.
export const taskTool = AGENT_BUILDING_ENABLED
  ? creativeTaskTool
  : {
      name: 'agent_task',
      description:
        'Queue ordered visits, uses of existing objects, player approaches, expressions and rests. Acceptance is not completion. Scenery editing is unavailable.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 512,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['action'],
              properties: {
                action: { type: 'string', enum: ['visit', 'use', 'approach', 'express', 'wait'] },
                target: taskStepSchema.properties.target,
                repeat: taskStepSchema.properties.repeat,
                milliseconds: taskStepSchema.properties.milliseconds,
              },
            },
          },
        },
      },
    };
const invalid = invalidPlan;

/** Session-local plans: no replay across a reconnect, no claiming acceptance as completion. */
export function createTaskQueue({ context, goals, call, now = Date.now, onChange = () => {} }) {
  let active,
    serial = 0;
  const history = [];
  const publish = () => {
    try {
      onChange(
        history.map(task => {
          const start = task.steps.length <= 16 ? 0 : Math.max(0, task.index - 4);
          return {
            id: task.id,
            player: task.player,
            request: task.request,
            status: task.status,
            completed: task.index,
            total: task.steps.length,
            steps: task.steps.slice(start, start + 16).map((step, offset) => ({
              action: step.action,
              target: step.target,
              label: step.label,
              status: step.status,
              ...(step.error ? { error: step.error } : {}),
              index: start + offset,
            })),
          };
        }),
      );
    } catch {
      // A local display failure must not change execution or cancellation.
    }
  };
  const finish = (status, error) => {
    const task = active;
    if (!task) return;
    task.status = status;
    for (const step of task.steps)
      if (step.status !== 'complete') {
        step.status = step.status === 'running' && status === 'failed' ? 'failed' : 'cancelled';
        if (error) step.error = error;
      }
    active = undefined;
    goals.clear();
    publish();
    return {
      type: 'task_result',
      player: task.player,
      request: task.request,
      status,
      completed: task.index,
      total: task.steps.length,
      steps: (task.steps.length <= 16
        ? task.steps
        : task.steps.slice(Math.max(0, task.index - 8), task.index + 8)
      ).map(step => ({ ...step })),
      ...(task.steps.length > 16 ? { truncated: true } : {}),
    };
  };
  return {
    get progress() {
      return active
        ? {
            task: active.id,
            completed: active.index,
            total: active.steps.length,
            status: active.status,
            next: active.steps[active.index]?.label,
          }
        : undefined;
    },
    get busy() {
      return !!active;
    },
    due() {
      return !!active && now() >= active.nextAt;
    },
    get player() {
      return active?.player;
    },
    cancel() {
      return finish('cancelled');
    },
    start(steps, player, catalog) {
      const state = context.observation;
      if (!player || !state.players.some(p => p.id === player)) throw invalid();
      steps = compileTask(steps, state, catalog);
      if (active)
        throw Object.assign(
          new Error('A task is already active. Wait for its result or cancel it.'),
          { code: 'task_pending' },
        );
      goals.clear();
      active = {
        id: ++serial,
        player,
        request: String(state.players.find(person => person.id === player)?.text ?? '').slice(
          0,
          1024,
        ),
        status: 'running',
        steps: steps.map(step => {
          const object = state.scene?.objects.find(object => object.id === step.target);
          const person = (state.roster ?? state.players).find(person => person.id === step.target);
          const label = String(
            object
              ? `${object.emoji || 'Object'} at ${object.x},${object.y}`
              : person?.name ||
                  (step.action === 'place'
                    ? `${step.emoji} at ${step.x},${step.y}`
                    : step.action === 'wait'
                      ? `Rest ${step.milliseconds}ms`
                      : step.target),
          ).slice(0, 120);
          return { ...step, label, status: 'pending' };
        }),
        index: 0,
        nextAt: 0,
      };
      history.unshift(active);
      history.length = Math.min(history.length, 20);
      publish();
      context.requestTurn();
      return { accepted: true, task: active.id, status: 'queued', steps: steps.length };
    },
    async advance(tools) {
      const task = active;
      if (!task || now() < task.nextAt) return;
      if (
        !(context.observation.roster ?? context.observation.players).some(p => p.id === task.player)
      )
        return finish('cancelled');
      const step = task.steps[task.index];
      try {
        if (step.status === 'pending') {
          step.status = 'running';
          step.expiresAt = now() + 45000;
          publish();
          if (step.action === 'wait') {
            task.nextAt = now() + step.milliseconds;
            return;
          }
          if (step.action === 'place') {
            const observed = await call('scape_observe', {}, tools);
            if (active !== task || context.signal.aborted) return;
            if (!observed.scene?.editCapabilities?.canPlace)
              throw Object.assign(new Error(), { code: 'editing_not_granted' });
            if (observed.self?.floor !== step.floor) throw invalid();
            const placement = {
              x: step.x,
              y: step.y,
              floor: step.floor,
              emoji: step.emoji,
              ...(step.objectConfig ? { objectConfig: step.objectConfig } : {}),
            };
            const result = await call(
              'scape_place_object',
              { ...placement, sceneRevision: observed.scene.sceneRevision },
              tools,
            );
            if (!result?.ok) throw Object.assign(new Error(), { code: 'invalid_edit' });
            step.result = { operationId: result.operationId, sceneRevision: result.sceneRevision };
            // Leave room for conversation/other actions within the gateway's 120/min allowance.
            const perMinute = Math.min(90, observed.scene.editCapabilities.maxEditsPerMinute || 30);
            task.nextAt = now() + Math.ceil(60000 / perMinute);
          } else if (step.action === 'express') {
            await call('scape_expression', { expression: step.target }, tools);
            task.nextAt = now() + 1100;
          } else if (step.action === 'approach')
            await call('scape_approach', { player: step.target }, tools);
          else await goals.start(step.target, step.action === 'use', task.player, tools);
        } else if (['visit', 'use'].includes(step.action)) {
          if (!goals.current || !(await goals.advance(tools)))
            throw Object.assign(new Error(), { code: 'target_unreachable' });
        }
        // Cancellation can arrive while a tool is pending. Never advance its old plan.
        if (active !== task) return;
        const state = context.observation;
        if (step.action === 'approach') {
          const target = (state.roster ?? state.players).find(p => p.id === step.target);
          if (!target) throw Object.assign(new Error(), { code: 'target_unavailable' });
          if (
            state.self?.floor !== target.floor ||
            Math.abs(state.self.x - target.x) + Math.abs(state.self.y - target.y) > 2 ||
            state.pursuit?.status === 'moving'
          ) {
            if (now() >= step.expiresAt)
              throw Object.assign(new Error(), { code: 'target_unreachable' });
            return;
          }
          await call('scape_stop', {}, tools);
        } else if (goals.current) return;
        if (active !== task) return;
        step.status = 'complete';
        task.index++;
        publish();
        if (task.index === task.steps.length) return finish('complete');
        context.requestTurn();
      } catch (error) {
        if (active !== task || context.signal.aborted) return;
        if (
          error.code === 'rate_limited' ||
          (step.action === 'place' && error.code === 'stale_scene')
        ) {
          step.status = 'pending';
          task.nextAt = now() + (error.code === 'rate_limited' ? 60000 : 1000);
          publish();
          return;
        }
        // Access and transport failures still reach the runtime's existing recovery boundary.
        if (
          ![
            'editing_not_granted',
            'edit_forbidden',
            'edit_conflict',
            'invalid_edit',
            'edit_receipt_unavailable',
            'interaction_unavailable',
            'target_unavailable',
            'stale_target',
            'target_unreachable',
            'invalid_target',
            'movement_pending',
            'invalid_expression',
            'rate_limited',
          ].includes(error.code)
        )
          throw error;
        const result = finish('failed', error.code);
        if (step.action === 'approach' && context.observation.pursuit?.player === step.target)
          await call('scape_stop', {}, tools);
        return result;
      }
    },
  };
}
