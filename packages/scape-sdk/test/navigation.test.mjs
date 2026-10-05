import assert from 'node:assert/strict';
import test from 'node:test';
import { defineObject, record, resolveGizmoNavigation } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const base = defineObject({
  type: 'test.route',
  version: 1,
  emoji: '🧭',
  label: 'Route',
  hint: '',
  initial: () => ({ destination: null }),
  valid: record,
  actions: { choose: { permission: 'editor', run: (_state, payload) => payload } },
});
const editor = { field: 'destination', action: 'choose', label: 'Destination' };
const context = { actorId: 'owner', canEdit: true, now: 1000, randomInt: () => 0 };

test('world picking, navigation and nearby text are independent capabilities', () => {
  const picker = new ObjectRegistry([{ ...base, worldEditor: editor }]);
  assert.equal(resolveGizmoNavigation(picker.all()[0], { destination: null }), null);
  const navigation = { ...base, navigate: () => ({ world: 'garden' }) };
  new ObjectRegistry([navigation]);
  assert.deepEqual(resolveGizmoNavigation(navigation, {}), { world: 'garden' });
  new ObjectRegistry([{ ...base, worldText: () => 'Nearby', worldTextRange: 3 }]);
});

test('navigation rejects URLs, authority, unbounded effects and invalid destination metadata', () => {
  for (const recipe of [
    { world: 'https://example.com' },
    { world: 'garden', owner: true },
    { world: 'garden', transition: { durationMs: 1001, scale: 0.02, opacity: 0.02 } },
    { world: 'garden', transition: { durationMs: 100, scale: NaN, opacity: 1 } },
    {
      world: 'garden',
      transition: { durationMs: 100, scale: 1, opacity: 1, trail: { color: 'red', opacity: 1 } },
    },
    { world: 'garden', feedback: { durationMs: 100, haptic: 'admin' } },
    { world: 'garden', feedback: { durationMs: 100, glow: {} } },
  ])
    assert.throws(() => new ObjectRegistry([{ ...base, navigate: () => recipe }]), /navigate/);
  for (const change of [
    { worldEditor: { ...editor, action: 'missing' } },
    { worldEditor: editor, initial: () => ({ destination: { id: 'garden', name: '\n' } }) },
    { worldTextRange: 4 },
    { worldText: () => '', worldTextRange: Infinity },
    {
      worldEditor: editor,
      textEditor: { field: 'text', action: 'choose', label: 'Text', maxLength: 10 },
    },
  ])
    assert.throws(() => new ObjectRegistry([{ ...base, ...change }]));
});

test('later action states and imported envelopes cannot bypass destination validation', () => {
  const definition = {
    ...base,
    worldEditor: editor,
    navigate: state => (state.destination ? { world: state.destination.id } : null),
  };
  const registry = new ObjectRegistry([definition]);
  const instance = registry.create(base.emoji, 'navigation-instance');
  const valid = { destination: { id: 'garden', name: 'Garden' } };
  assert.equal(
    resolveGizmoNavigation(
      definition,
      registry.act(instance, { name: 'choose', payload: valid }, context).state,
    ).world,
    'garden',
  );
  for (const destination of [
    { id: 'garden', name: '\n' },
    { id: 'garden', name: '', token: 'no' },
    undefined,
  ]) {
    assert.equal(registry.validate({ ...instance, state: { destination } }), false);
    assert.throws(() =>
      registry.act(instance, { name: 'choose', payload: { destination } }, context),
    );
  }
  assert.throws(() =>
    registry.act(instance, { name: 'choose', payload: valid }, { ...context, canEdit: false }),
  );
  const copy = resolveGizmoNavigation(definition, valid);
  copy.world = 'changed';
  assert.equal(
    resolveGizmoNavigation(definition, valid).world,
    'garden',
    'host consumers cannot mutate cached author output',
  );
});
