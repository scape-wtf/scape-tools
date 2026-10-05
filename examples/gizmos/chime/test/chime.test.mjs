import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { chime } from '../dist/definition.js';

const registry = new ObjectRegistry([chime]);
const action = { name: 'ring', payload: {} };
const listener = { actorId: 'visitor', canEdit: false, now: 1000, randomInt: () => 0 };

test('accepted rings carry feedback and a 250 ms cooldown', () => {
  const initial = registry.create('🛎️', 'chime-example-instance');
  const result = registry.execute(initial, action, listener);
  assert.deepEqual(result.instance.state, { lastAt: 1000 });
  assert.equal(result.reaction.feedback.audio[0].sound, 'ring');
  assert.equal(result.reaction.feedback.durationMs, 600);
  assert.throws(
    () => registry.execute(result.instance, action, { ...listener, now: 1249 }),
    /Let the chime ring/,
  );
  assert.equal(
    registry.execute(result.instance, action, { ...listener, now: 1250 }).instance.state.lastAt,
    1250,
  );
  assert.equal(chime.view(initial.state, listener).controls[0].placement, 'action');
});
