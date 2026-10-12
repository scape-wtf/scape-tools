import assert from 'node:assert/strict';
import test from 'node:test';
import { defineProject, validProjectMetadata } from '../dist/index.js';

test('project copy is required and validated', () => {
  assert.throws(() => defineProject({ objects: [] }), /project name/);
  const project = { name: 'Lamp', description: 'A configurable lamp.', objects: [] };
  assert.deepEqual(defineProject(project), project);
  assert.ok(validProjectMetadata(project));
  assert.ok(validProjectMetadata({ name: 'a'.repeat(80), description: 'a'.repeat(1000) }));
  for (const invalid of [
    { name: 'Lamp' },
    { description: 'A configurable lamp.' },
    { name: ' ', description: 'A configurable lamp.' },
    { name: 'a'.repeat(81), description: 'A configurable lamp.' },
    { name: 'Lamp', description: 'too short' },
    { name: 'Lamp', description: 'a'.repeat(1001) },
    { name: 12, description: 'A configurable lamp.' },
    { name: 'Lamp', description: '         x' },
  ]) {
    assert.equal(validProjectMetadata(invalid), false);
    assert.throws(() => defineProject({ ...invalid, objects: [] }), /project name/);
  }
});
