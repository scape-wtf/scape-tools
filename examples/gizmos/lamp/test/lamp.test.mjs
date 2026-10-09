import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGizmoLighting } from '@scape-wtf/sdk';
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
