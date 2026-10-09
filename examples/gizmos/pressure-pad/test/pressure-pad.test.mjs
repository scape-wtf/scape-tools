import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGizmoStep } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { pressurePad } from '../dist/definition.js';
test('standalone pressure pad reacts to walking and conveyor arrival without saved state changes', () => {
  const registry = new ObjectRegistry([pressurePad]),
    pad = registry.create('🔘', 'standalone-pad-001');
  for (const movement of ['walk', 'push']) {
    const effects = resolveGizmoStep(pressurePad, pad.state, {
      id: 'step-1',
      at: 1000,
      movement,
    });
    assert.equal(effects.durationMs, 600);
    assert.equal(effects.audio[0].loop, false);
    assert.equal(effects.lighting.light.color, movement === 'walk' ? '#6bdfff' : '#a28aff');
    assert.deepEqual(pad.state, {});
  }
});

test('connection outputs are host-observed events and occupancy, independent of cosmetic step feedback', () => {
  assert.equal(pressurePad.outputs.pressed.source, 'arrival');
  assert.equal(pressurePad.outputs.released.source, 'departure');
  assert.equal(pressurePad.outputs.occupied.kind, 'boolean');
  assert.equal(pressurePad.outputs.occupied.source, 'occupancy');
  assert.deepEqual(pressurePad.initial(), {});
  assert.equal(pressurePad.signals, undefined);
});
