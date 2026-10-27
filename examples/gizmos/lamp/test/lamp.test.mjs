import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGizmoLighting, validObjectView } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { lamp } from '../dist/definition.js';

test('each lamp owns its state; participants switch it and editors choose its color', () => {
  const registry = new ObjectRegistry([lamp]);
  const first = registry.create('🏮', 'lamp-instance-0001');
  const second = registry.create('🏮', 'lamp-instance-0002');
  const viewer = {
    actorId: 'visitor',
    canEdit: false,
    now: 0,
    randomInt: () => 0,
  };
  const off = registry.act(first, { name: 'toggle', payload: {} }, viewer);
  assert.deepEqual(resolveGizmoLighting(lamp, off.state), {});
  assert.equal(resolveGizmoLighting(lamp, second.state).light.color, '#ffc078');
  assert.throws(
    () => registry.act(first, { name: 'color', payload: { color: 'blue' } }, viewer),
    /cannot perform/,
  );
  const blue = registry.act(
    first,
    { name: 'color', payload: { color: 'blue' } },
    { ...viewer, canEdit: true },
  );
  const effects = resolveGizmoLighting(lamp, blue.state);
  assert.equal(effects.light.color, '#6baaff');
  assert.equal(effects.glow.color, '#6baaff');
  assert.throws(
    () =>
      registry.act(
        first,
        { name: 'color', payload: { color: 'unknown' } },
        { ...viewer, canEdit: true },
      ),
    /Choose a lamp color/,
  );
});

test('Power accepts explicit on/off values and exposes state without changing the manual switch', () => {
  const registry = new ObjectRegistry([lamp]);
  const item = registry.create('🏮', 'connected-lamp-0001');
  const context = { actorId: 'gizmo-signal', canEdit: false, now: 0, randomInt: () => 0 };
  const off = registry.execute(item, { name: 'power', payload: { on: false } }, context);
  assert.equal(off.instance.state.on, false);
  assert.deepEqual(off.signals, { power: false });
  assert.equal(lamp.inputs.power.combine, 'any');
  assert.deepEqual(lamp.inputs.power.locks, ['toggle', 'power']);
  assert.throws(
    () => registry.act(item, { name: 'power', payload: { on: 'false' } }, context),
    /on or off/,
  );
});

test('custom picker colors drive light and glow while all three presets remain available', () => {
  const registry = new ObjectRegistry([lamp]);
  const item = registry.create('🏮', 'custom-lamp-0001');
  const viewer = { actorId: 'owner', canEdit: true, now: 0, randomInt: () => 0 };
  const custom = registry.act(item, { name: 'color', payload: { color: '#12ab34' } }, viewer);
  assert.equal(custom.state.color, '#12ab34');
  const effects = resolveGizmoLighting(lamp, custom.state);
  assert.equal(effects.light.color, '#12ab34');
  assert.equal(effects.glow.color, '#12ab34');
  const view = lamp.view(custom.state, viewer);
  assert.ok(validObjectView(view));
  assert.deepEqual(view.fields, [
    { id: 'color', label: 'Custom color', kind: 'color', value: '#12ab34' },
  ]);
  assert.deepEqual(
    view.controls
      .filter(control => ['warm', 'blue', 'pink'].includes(control.id))
      .map(control => control.label),
    ['Warm', 'Blue', 'Pink'],
  );
  assert.equal(view.controls.find(control => control.id === 'custom-color').trigger, 'change');
  for (const [preset, hex] of Object.entries({
    warm: '#ffc078',
    blue: '#6baaff',
    pink: '#ff80ba',
  })) {
    assert.ok(lamp.valid({ on: true, color: preset }));
    const selected = registry.act(custom, { name: 'color', payload: { color: preset } }, viewer);
    assert.equal(resolveGizmoLighting(lamp, selected.state).light.color, hex);
    assert.equal(
      lamp.view(selected.state, viewer).controls.find(control => control.id === preset).pressed,
      true,
    );
    assert.equal(
      registry.act(custom, { name: 'color', payload: { color: hex } }, viewer).state.color,
      preset,
    );
  }
  for (const color of ['#ABCDEF', '#123', '#12345678', 'red', '', null, 123]) {
    assert.equal(lamp.valid({ on: true, color }), false);
    assert.throws(() => registry.act(custom, { name: 'color', payload: { color } }, viewer));
  }
  const visitor = { ...viewer, canEdit: false };
  assert.deepEqual(lamp.view(custom.state, visitor).fields, []);
  assert.throws(
    () => registry.act(custom, { name: 'color', payload: { color: '#abcdef' } }, visitor),
    /cannot perform/,
  );
  assert.deepEqual(
    resolveGizmoLighting(
      lamp,
      registry.act(custom, { name: 'toggle', payload: {} }, visitor).state,
    ),
    {},
  );
});
