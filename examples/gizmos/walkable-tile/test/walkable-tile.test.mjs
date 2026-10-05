import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { walkableTile } from '../dist/definition.js';

test('a walkable tile needs no actions, push or arrival effects', () => {
  const registry = new ObjectRegistry([walkableTile]);
  assert.deepEqual(registry.create('🟦', 'walkable-example-instance').state, {});
  assert.equal(walkableTile.valid({ unexpected: true }), false);
  assert.equal(walkableTile.walkable, true);
  assert.equal(walkableTile.push, undefined);
  assert.equal(walkableTile.step, undefined);
  assert.equal(walkableTile.view, undefined);
});
