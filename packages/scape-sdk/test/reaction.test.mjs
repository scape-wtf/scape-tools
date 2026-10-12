import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectRegistry } from '../dist/runtime.js';
import { gizmoFeedbackError } from '../dist/index.js';
const base = {
  type: 'demo.signal',
  version: 1,
  emoji: '🛎️',
  label: 'Signal',
  hint: 'Emit',
  initial: () => ({}),
  valid: s => s && Object.keys(s).length === 0,
  actions: { emit: { permission: 'participant', run: s => s } },
  react: () => ({
    feedback: { durationMs: 100, burst: { color: '#00ff00', radiusCells: 1, particles: 0 } },
  }),
};
const context = { actorId: 'alice', canEdit: false, now: 1000, randomInt: () => 0 };
test('reactions are separate from saved state and bounded before host effects', () => {
  const registry = new ObjectRegistry([base]),
    instance = registry.create(base.emoji, 'custom-signal-0001');
  assert.deepEqual(
    registry.execute(instance, { name: 'emit', payload: {} }, context).instance,
    instance,
  );
  for (const feedback of [
    { durationMs: 2001 },
    { durationMs: 100, burst: { color: '#ffffff', radiusCells: 9, particles: 2 } },
    { durationMs: 100, impulse: { scale: 9, rotation: 0 } },
    { durationMs: 100, lighting: { glow: {} } },
    { durationMs: 100, cameraShake: { strength: 99, durationMs: 20 } },
    { durationMs: 100, haptic: 'explosion' },
    { durationMs: 100, impulse: { scale: 1.1, rotation: 0, durationMs: 101 } },
    { durationMs: 100, script: 'bad' },
  ])
    assert.ok(gizmoFeedbackError(feedback, {}));
  assert.throws(
    () => new ObjectRegistry([{ ...base, areaRemoval: { radiusCells: 4 } }]),
    /area removal/,
  );
  const destructive = new ObjectRegistry([
    { ...base, react: () => ({ removeArea: { radiusCells: 0 } }) },
  ]);
  assert.throws(
    () => destructive.execute(instance, { name: 'emit', payload: {} }, context),
    /declared capability/,
  );
  assert.throws(
    () =>
      new ObjectRegistry([{ ...base, interaction: { bump: { name: 'missing', payload: {} } } }]),
    /interaction/,
  );
});

test('number feedback rejects nonpositive, fractional and unbounded values', () => {
  for (const number of [0, -1, 1.5, Infinity, 1000001, '3']) {
    assert.ok(gizmoFeedbackError({ durationMs: 900, number }, {}));
  }
  assert.equal(gizmoFeedbackError({ durationMs: 900, number: 9999 }, {}), null);
});

test('BUG-220: immediate interaction audio is explicit, bounded and participant-only', () => {
  const sound = {
    kind: 'synth',
    duration: 0.1,
    voices: [{ wave: 'sine', start: 0, duration: 0.1, frequency: 440, gain: 0.1 }],
  };
  const command = {
    kind: 'play',
    voice: 'contact',
    sound: 'note',
    delayMs: 0,
    gain: 1,
    rate: 1,
    loop: false,
    rangeCells: [1, 8],
    stereo: 1,
  };
  const feedback = { durationMs: 100, audioMode: 'replace', audio: [command] };
  const definition = {
    ...base,
    sounds: { note: sound },
    interaction: { bump: { name: 'emit', payload: {} } },
    interactionFeedback: { emit: feedback },
  };
  assert.doesNotThrow(() => new ObjectRegistry([definition]));
  for (const bad of [
    { ...feedback, number: 2 },
    { ...feedback, audioMode: 'queue' },
    { ...feedback, audio: [] },
    { ...feedback, audio: [{ ...command, delayMs: 1 }] },
    { ...feedback, audio: [{ ...command, loop: true }] },
    { ...feedback, audio: [{ ...command, sound: 'missing' }] },
  ])
    assert.throws(
      () => new ObjectRegistry([{ ...definition, interactionFeedback: { emit: bad } }]),
      /interaction feedback|interactionFeedback/i,
    );
  assert.throws(
    () => new ObjectRegistry([{ ...definition, interaction: undefined }]),
    /interaction/i,
  );
  assert.throws(
    () =>
      new ObjectRegistry([
        { ...definition, actions: { emit: { ...base.actions.emit, permission: 'editor' } } },
      ]),
    /participant/i,
  );
  const registry = new ObjectRegistry([definition]);
  const result = registry.execute(
    registry.create(base.emoji, 'contact-audio-0001'),
    { name: 'emit', payload: {} },
    context,
  );
  assert.equal(
    result.reaction.feedback.audio,
    undefined,
    'immediate feedback does not fabricate confirmed effects',
  );
});

test('BUG-221: participant contact bursts are bounded, optional alongside audio and explicitly replaceable', () => {
  const feedback = {
    durationMs: 600,
    burstMode: 'replace',
    burst: { color: '#a9e8ff', radiusCells: 1.5, particles: 0 },
  };
  const definition = {
    ...base,
    interaction: { bump: { name: 'emit', payload: {} } },
    interactionFeedback: { emit: feedback },
  };
  assert.doesNotThrow(() => new ObjectRegistry([definition]));
  for (const bad of [
    { durationMs: 600 },
    { ...feedback, burst: undefined },
    { ...feedback, burstMode: 'queue' },
    { ...feedback, burst: { ...feedback.burst, radiusCells: 99 } },
    { ...feedback, burst: { ...feedback.burst, particles: 999 } },
    { ...feedback, impulse: { scale: 2, rotation: 0 } },
  ])
    assert.throws(
      () => new ObjectRegistry([{ ...definition, interactionFeedback: { emit: bad } }]),
      /interaction/i,
    );
  const reaction = new ObjectRegistry([
    { ...base, react: () => ({ feedback: { durationMs: 100, burstMode: 'replace' } }) },
  ]);
  assert.throws(
    () =>
      reaction.execute(
        reaction.create(base.emoji, 'burst-invalid-0001'),
        { name: 'emit', payload: {} },
        context,
      ),
    /burst mode/i,
  );
});
