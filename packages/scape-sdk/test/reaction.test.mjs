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
