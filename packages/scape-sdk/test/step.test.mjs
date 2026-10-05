import assert from 'node:assert/strict';
import test from 'node:test';
import { gizmoStepError, resolveGizmoStep } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';
const event = { id: 'arrival-1', at: 1000, movement: 'walk' };
const definition = {
  type: 'custom.pad',
  version: 1,
  emoji: '🔘',
  label: 'Pad',
  hint: 'Step',
  initial: () => ({ on: true }),
  valid: s => typeof s.on === 'boolean',
  actions: { toggle: { permission: 'participant', run: s => ({ on: !s.on }) } },
  step: () => ({ durationMs: 600 }),
};
test('step callbacks receive detached state and event data, and output is copied', () => {
  const state = { on: true },
    effects = { durationMs: 600, lighting: {} };
  const result = resolveGizmoStep(
    {
      ...definition,
      step: (s, e) => {
        s.on = false;
        e.id = 'changed';
        return effects;
      },
    },
    state,
    event,
  );
  result.lighting.light = null;
  assert.deepEqual(effects, { durationMs: 600, lighting: {} });
  assert.equal(state.on, true);
  assert.equal(event.id, 'arrival-1');
  assert.equal(resolveGizmoStep({ ...definition, step: undefined }, state, event), null);
  for (const input of [
    { ...event, at: -1 },
    { ...event, movement: 'teleport' },
    { ...event, id: '' },
    { ...event, actorId: 'forged' },
  ])
    assert.throws(() => resolveGizmoStep(definition, state, input), /Invalid step/);
});
test('step feedback rejects unsafe output and validates both movement types and action states', () => {
  const sound = {
    kind: 'synth',
    duration: 0.1,
    voices: [{ wave: 'sine', frequency: 440, start: 0, duration: 0.1, gain: 0.1 }],
  };
  const play = {
    kind: 'play',
    voice: 'note',
    sound: 'note',
    delayMs: 0,
    gain: 0.5,
    rate: 1,
    loop: false,
    rangeCells: [1, 8],
    stereo: 1,
  };
  for (const output of [
    undefined,
    [],
    { durationMs: 0 },
    { durationMs: 2001 },
    { durationMs: NaN },
    { durationMs: 500, state: {} },
    { durationMs: 500, lighting: { shader: 'unsafe' } },
    { durationMs: 500, audio: [{ ...play, loop: true }] },
    { durationMs: 500, audio: [{ ...play, delayMs: 500 }] },
    { durationMs: 500, audio: [{ ...play, sound: 'missing' }] },
  ]) {
    assert.ok(gizmoStepError(output, { note: sound }));
    assert.throws(
      () =>
        new ObjectRegistry([
          {
            ...definition,
            sounds: { note: sound },
            step: (_s, e) => (e.movement === 'walk' ? null : output),
          },
        ]),
      /step/,
    );
    const registry = new ObjectRegistry([
      { ...definition, sounds: { note: sound }, step: s => (s.on ? null : output) },
    ]);
    const initial = registry.create('🔘', 'step-instance-001');
    assert.throws(
      () =>
        registry.act(
          initial,
          { name: 'toggle', payload: {} },
          { actorId: 'viewer', canEdit: false, now: 1000, randomInt: () => 0 },
        ),
      /step/,
    );
    assert.equal(initial.state.on, true);
  }
  assert.equal(gizmoStepError({ durationMs: 500, audio: [play] }, { note: sound }), null);
});
