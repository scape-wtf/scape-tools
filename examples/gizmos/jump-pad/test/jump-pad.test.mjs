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
