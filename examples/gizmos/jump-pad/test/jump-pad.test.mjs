import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { resolveGizmoTravel } from '@scape-wtf/sdk';
import { jumpPad } from '../dist/definition.js';

test('jump pad uses offset travel without a link or Portal dependency', () => {
  const registry = new ObjectRegistry([jumpPad]);
  const instance = registry.create(jumpPad.emoji, 'test-jump-pad-instance');
  assert.equal(jumpPad.link, undefined);
  assert.deepEqual(resolveGizmoTravel(jumpPad, instance.state).destination, {
    kind: 'offset',
    x: 4,
    y: 0,
  });
});

test('landing activation and a neutral-ended flight allow consecutive jumps', () => {
  const recipe = resolveGizmoTravel(jumpPad, {});
  assert.equal(recipe.activateOnArrival, true);
  assert.ok(recipe.motion.durationMs >= recipe.cooldownMs);
  assert.ok(recipe.motion.frames.some(frame => frame.offset[1] > 1));
  for (const frame of [recipe.motion.frames[0], recipe.motion.frames.at(-1)]) {
    assert.deepEqual(frame.offset, [0, 0]);
    assert.deepEqual(frame.scale, [1, 1]);
  }
});
