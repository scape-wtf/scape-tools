import test from 'node:test';
import assert from 'node:assert/strict';
import { defineObject, resolveGizmoSignals, validGizmoConnections } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';
const definition = () =>
  defineObject({
    type: 'test.connected',
    version: 1,
    emoji: '🟩',
    label: 'Connected',
    hint: '',
    initial: () => ({ on: false }),
    valid: s => typeof s?.on === 'boolean',
    actions: { set: { permission: 'participant', run: (_s, p) => ({ on: p.on }) } },
    inputs: { power: { kind: 'boolean', label: 'Power', action: 'set', value: 'on' } },
    outputs: { power: { kind: 'boolean', label: 'Power' } },
    signals: s => ({ power: s.on }),
  });
test('SDK accepts opt-in ports and produces validated output values without leaking instances into configuration', () => {
  const d = definition(),
    r = new ObjectRegistry([d]);
  const instance = r.create('🟩', 'connected-test-0001');
  const result = r.execute(
    instance,
    { name: 'set', payload: { on: true } },
    { actorId: 'gizmo-signal', canEdit: false, now: 1, randomInt: () => 0 },
  );
  assert.deepEqual(result.signals, { power: true });
  assert.deepEqual(resolveGizmoSignals(d, instance.state), { power: false });
  assert.equal(
    validGizmoConnections([{ output: 'power', target: 'connected-test-0002', input: 'power' }]),
    true,
  );
  assert.equal(validGizmoConnections([{ output: 'power', target: 'x', input: 'power' }]), false);
});
test('SDK rejects implicit permission escalation, invalid ports and spoofed movement outputs', () => {
  const d = definition();
  assert.throws(
    () =>
      new ObjectRegistry([
        { ...d, actions: { ...d.actions, set: { ...d.actions.set, permission: 'editor' } } },
      ]),
    /input/,
  );
  assert.throws(
    () =>
      new ObjectRegistry([
        { ...d, outputs: { power: { kind: 'boolean', label: 'Power', source: 'arrival' } } },
      ]),
    /source/,
  );
  assert.throws(
    () => resolveGizmoSignals({ ...d, signals: () => ({ power: 3 }) }, { on: false }),
    /value/,
  );
  assert.throws(
    () => resolveGizmoSignals({ ...d, signals: () => ({ unknown: null }) }, { on: false }),
    /value/,
  );
  assert.throws(
    () =>
      new ObjectRegistry([
        {
          ...d,
          walkable: true,
          outputs: { power: { kind: 'boolean', label: 'Power', source: 'occupancy' } },
        },
      ]),
    /value/,
  );
});

test('optional event phrases support natural connection copy without changing actions', () => {
  const base = definition();
  const d = {
    ...base,
    inputs: {
      start: {
        label: 'Start',
        phrase: 'start',
        kind: 'event',
        action: 'set',
        payload: { on: true },
      },
    },
    outputs: { started: { label: 'Started', phrase: 'a round starts on', kind: 'event' } },
    signals: (_state, _previous, action) => (action ? { started: null } : {}),
  };
  const registry = new ObjectRegistry([d]);
  const instance = registry.create('🟩', 'phrased-test-0001');
  const result = registry.execute(
    instance,
    { name: 'set', payload: { on: true } },
    { actorId: 'tester', canEdit: false, now: 1, randomInt: () => 0 },
  );
  assert.equal(result.instance.state.on, true);
  assert.deepEqual(result.signals, { started: null });
  for (const phrase of ['', ' '.repeat(2), 'x'.repeat(81), 42]) {
    assert.throws(
      () => new ObjectRegistry([{ ...d, inputs: { start: { ...d.inputs.start, phrase } } }]),
      /port/,
    );
    assert.throws(
      () => new ObjectRegistry([{ ...d, outputs: { started: { ...d.outputs.started, phrase } } }]),
      /port/,
    );
  }
  assert.throws(
    () =>
      new ObjectRegistry([
        { ...base, inputs: { power: { ...base.inputs.power, phrase: 'power' } } },
      ]),
    /port/,
  );
});
