import assert from 'node:assert/strict';
import test from 'node:test';
import { defineObject, gizmoPushError, resolveGizmoPush } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const definition = defineObject({
  type: 'test.push',
  version: 1,
  emoji: '🪭',
  label: 'Fan',
  hint: '',
  walkable: true,
  initial: () => ({ on: true }),
  valid: state => typeof state?.on === 'boolean',
  actions: { toggle: { permission: 'participant', run: state => ({ on: !state.on }) } },
  push: state => (state.on ? { direction: 'right' } : null),
});
const context = { actorId: 'player', canEdit: true, now: 0, randomInt: () => 0 };

test('a state-derived push is independent of cosmetic arrivals and does not mutate saved state', () => {
  const registry = new ObjectRegistry([definition]);
  const initial = registry.create('🪭', 'push-test-instance');
  assert.deepEqual(resolveGizmoPush(definition, initial.state), { direction: 'right' });
  const off = registry.act(initial, { name: 'toggle', payload: {} }, context);
  assert.equal(resolveGizmoPush(definition, off.state), null);
  resolveGizmoPush(
    {
      ...definition,
      push: state => {
        state.on = false;
        return null;
      },
    },
    initial.state,
  );
  assert.deepEqual(initial.state, { on: true });
});

test('walkability is explicit, defaults to blocking, and is required for pushing', () => {
  assert.doesNotThrow(
    () => new ObjectRegistry([{ ...definition, push: undefined, walkable: undefined }]),
  );
  assert.doesNotThrow(
    () =>
      new ObjectRegistry([{ ...definition, push: undefined, walkable: false, step: () => null }]),
  );
  for (const walkable of [undefined, false, 'yes', 1, null]) {
    assert.throws(() => new ObjectRegistry([{ ...definition, walkable }]), /walkable/);
  }
  assert.throws(
    () => new ObjectRegistry([{ ...definition, push: { direction: 'up' } }]),
    /callback/,
  );
});

test('push output is bounded at registration, accepted actions and live evaluation', () => {
  for (const bad of [
    undefined,
    {},
    [],
    { direction: 'diagonal' },
    { direction: [1, 0] },
    { direction: 'up', speed: 500 },
    { direction: 'up', playerId: 'other' },
    { direction: 'up', teleport: true },
    { direction: 'up', blockOpposingInput: 1 },
  ]) {
    assert.ok(gizmoPushError(bad));
    assert.throws(() => new ObjectRegistry([{ ...definition, push: () => bad }]), /push/);
    const conditional = { ...definition, push: state => (state.on ? null : bad) };
    const registry = new ObjectRegistry([conditional]);
    assert.throws(
      () =>
        registry.act(
          registry.create('🪭', 'push-test-instance'),
          { name: 'toggle', payload: {} },
          context,
        ),
      /push/,
    );
  }
  for (const direction of ['right', 'down', 'left', 'up']) {
    assert.equal(gizmoPushError({ direction, blockOpposingInput: false }), null);
  }
  assert.equal(gizmoPushError(null), null);
});
