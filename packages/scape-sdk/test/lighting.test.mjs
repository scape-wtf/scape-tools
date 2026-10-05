import assert from 'node:assert/strict';
import test from 'node:test';
import { gizmoLightingError, resolveGizmoLighting } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const light = { radiusCells: 3, color: '#88aaff', intensity: 0.1, illumination: 0.7 };
const definition = {
  type: 'custom.light',
  version: 1,
  emoji: '💡',
  label: 'Lamp',
  hint: 'Lamp',
  initial: () => ({ on: true }),
  valid: s => typeof s.on === 'boolean',
  actions: { toggle: { permission: 'participant', run: state => ({ on: !state.on }) } },
  lighting: state => (state.on ? { light } : {}),
};
const context = { actorId: 'viewer', canEdit: false, now: 0, randomInt: () => 0 };

test('state lighting fully replaces fixed recipes, supports off and copies inputs and outputs', () => {
  const registry = new ObjectRegistry([definition]);
  const first = registry.create('💡', 'lighting-instance-01');
  const next = registry.act(first, { name: 'toggle', payload: {} }, context);
  assert.deepEqual(resolveGizmoLighting({ ...definition, light }, next.state), {});
  const rendered = resolveGizmoLighting(definition, first.state);
  rendered.light.color = '#ffffff';
  assert.equal(light.color, '#88aaff');
  const mutating = {
    ...definition,
    lighting: state => {
      state.on = false;
      return {};
    },
  };
  resolveGizmoLighting(mutating, first.state);
  assert.equal(first.state.on, true);
  assert.deepEqual(resolveGizmoLighting({ ...definition, lighting: undefined, light }, {}), {
    light,
    glow: null,
  });
});

test('invalid initial and action-generated lighting cannot be accepted; errors identify the field', () => {
  for (const result of [
    null,
    [],
    { shader: 'code' },
    { light: { ...light, radiusCells: Infinity } },
    { glow: {} },
    { light: { ...light, intensity: 2 } },
  ]) {
    assert.ok(gizmoLightingError(result));
    assert.throws(
      () => new ObjectRegistry([{ ...definition, lighting: () => result }]),
      /lighting/,
    );
    const invalidLater = { ...definition, lighting: state => (state.on ? { light } : result) };
    const registry = new ObjectRegistry([invalidLater]);
    const first = registry.create('💡', 'lighting-instance-02');
    assert.throws(() => registry.act(first, { name: 'toggle', payload: {} }, context), /lighting/);
    assert.equal(first.state.on, true);
  }
});
