import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { chime } from '../dist/definition.js';

const registry = new ObjectRegistry([chime]);
const action = { name: 'ring', payload: {} };
const listener = { actorId: 'visitor', canEdit: false, now: 1000, randomInt: () => 0 };

test('bumps declare immediate replacing rings and still accept each action', () => {
  const initial = registry.create('🛎️', 'chime-example-instance');
  assert.deepEqual(chime.interaction.bump, action);
  assert.equal(chime.view, undefined);
  assert.equal(chime.interactionFeedback.ring.audioMode, 'replace');
  assert.equal(chime.interactionFeedback.ring.burstMode, 'replace');
  assert.deepEqual(chime.interactionFeedback.ring.burst, {
    color: '#a9e8ff',
    radiusCells: 1.5,
    particles: 0,
  });
  assert.equal(chime.interactionFeedback.ring.audio[0].delayMs, 0);
  let instance = initial;
  for (const now of [1000, 1000, 1050, 1100]) {
    const result = registry.execute(instance, action, { ...listener, now });
    instance = result.instance;
    assert.deepEqual(instance.state, { lastAt: now });
    assert.equal(result.reaction.feedback.audio[0].sound, 'ring');
    assert.equal(result.reaction.feedback.durationMs, 600);
    assert.deepEqual(result.reaction.feedback.audio, chime.interactionFeedback.ring.audio);
    assert.equal(result.reaction.feedback.audioMode, 'replace');
    assert.deepEqual(result.reaction.feedback.burst, chime.interactionFeedback.ring.burst);
    assert.equal(result.reaction.feedback.burstMode, 'replace');
  }
});
