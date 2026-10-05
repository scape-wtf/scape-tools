import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGizmoPush } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import fan from '../dist/definition.js';

test('each fan owns its direction and switch, while walkability is unchanged', () => {
  const registry = new ObjectRegistry([fan]);
  const first = registry.create('🪭', 'fan-instance-0001');
  const second = registry.create('🪭', 'fan-instance-0002');
  const viewer = {
    actorId: 'visitor',
    canEdit: false,
    now: 0,
    randomInt: () => 0,
  };
  assert.equal(fan.walkable, true);
  assert.equal(fan.step, undefined);
  for (const direction of ['right', 'down', 'left', 'up']) {
    const action = { name: 'direction', payload: { direction } };
    assert.throws(() => registry.act(first, action, viewer), /cannot perform/);
    const turned = registry.act(first, action, { ...viewer, canEdit: true });
    assert.deepEqual(resolveGizmoPush(fan, turned.state), { direction });
    const off = registry.act(turned, { name: 'toggle', payload: {} }, viewer);
    assert.equal(resolveGizmoPush(fan, off.state), null);
    assert.equal(resolveGizmoPush(fan, second.state).direction, 'right');
  }
  assert.throws(
    () =>
      registry.act(
        first,
        { name: 'direction', payload: { direction: 'diagonal' } },
        { ...viewer, canEdit: true },
      ),
    /Choose a direction/,
  );
});

test('direction choices use the public select/autosave contract with no host-specific values', () => {
  const state = fan.initial(),
    view = fan.view(state, { actorId: 'owner', canEdit: true });
  const field = view.fields[0],
    control = view.controls.find(control => control.id === 'direction');
  assert.equal(field.kind, 'select');
  assert.equal(field.value, 'right');
  assert.deepEqual(
    field.options.map(option => option.value),
    ['right', 'down', 'left', 'up'],
  );
  assert.equal(control.trigger, 'change');
  assert.deepEqual(control.fields, ['direction']);
  assert.equal(
    fan
      .view(state, { actorId: 'visitor', canEdit: false })
      .controls.find(control => control.id === 'direction').disabled,
    true,
  );
});
