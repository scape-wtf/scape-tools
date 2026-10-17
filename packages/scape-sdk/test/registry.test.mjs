import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '../dist/runtime.js';

const definition = (type, emoji) => ({
  type,
  emoji,
  version: 1,
  label: 'Fixture',
  hint: 'Fixture',
  initial: () => ({}),
  valid: () => true,
  actions: {},
});

test('BUG-251: replacement forks validate once and preserve independent failure records atomically', () => {
  let initialCalls = 0;
  const healthy = {
    ...definition('test.healthy', '🧩'),
    initial: () => {
      initialCalls++;
      return {};
    },
  };
  const broken = { ...definition('test.broken', '💥'), valid: () => false };
  const base = new ObjectRegistry([healthy, broken], { isolateInvalidDefinitions: true });
  initialCalls = 0;
  const replacement = base.forkReplacing([healthy]);
  assert.equal(initialCalls, 1, 'validate the complete replacement exactly once');
  assert.deepEqual(replacement.all(), [healthy]);
  assert.deepEqual(replacement.failures(), base.failures());
  assert.throws(() => replacement.create('💥', 'disabled-fixture'), /Invalid initial|initial/);
  assert.throws(() => base.forkReplacing([healthy, broken]), /initial/);
  assert.deepEqual(base.all(), [healthy]);
  assert.deepEqual(replacement.all(), [healthy]);
  const recovered = base.forkReplacing([healthy, definition('test.broken', '💥')]);
  assert.equal(recovered.failures().length, 0);
  assert.equal(base.failures().length, 1, 'successful replacement never mutates its source');
  replacement.disable(healthy, 'local failure');
  assert.equal(base.failures().length, 1);
  assert.deepEqual(base.all(), [healthy]);
  const failures = replacement.failures();
  failures[0].message = 'caller mutation';
  assert.notEqual(replacement.failures()[0].message, 'caller mutation');
});
