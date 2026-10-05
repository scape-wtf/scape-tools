import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { counter } from '../dist/definition.js';

const registry = new ObjectRegistry([counter]);
const participant = { actorId: 'visitor', canEdit: false, now: 1000, randomInt: () => 0 };

test('participants increment; only editors reset; the count stays bounded', () => {
  const initial = registry.create('🔢', 'counter-example-instance');
  const increment = { name: 'increment', payload: {} };
  const reset = { name: 'reset', payload: {} };
  const changed = registry.act(initial, increment, participant);
  assert.deepEqual(changed.state, { count: 1 });
  assert.throws(() => registry.act(changed, reset, participant), /cannot perform/);
  assert.deepEqual(registry.act(changed, reset, { ...participant, canEdit: true }).state, {
    count: 0,
  });
  assert.throws(
    () => registry.act({ ...changed, state: { count: 9999 } }, increment, participant),
    /Reset/,
  );
  assert.equal(counter.valid({ count: -1 }), false);
  assert.equal(counter.valid({ count: 10000 }), false);
});
