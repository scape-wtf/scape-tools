import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '../dist/runtime.js';

const tile = {
  type: 'test.tile',
  version: 1,
  emoji: '🔳',
  legacyEmojis: ['🟦'],
  label: 'Tile',
  hint: 'Walkable tile',
  initial: () => ({}),
  valid: state => !!state && typeof state === 'object',
  actions: {},
  walkable: true,
};

test('legacy identities resolve without adding duplicate catalog entries and retire with their definition', () => {
  const registry = new ObjectRegistry([tile]);
  assert.equal(registry.forEmoji('🟦'), tile);
  assert.equal(registry.forEmoji('🔳'), tile);
  assert.deepEqual(registry.all(), [tile]);
  const copy = registry.fork();
  registry.disable(tile, 'test retirement');
  assert.equal(registry.forEmoji('🟦'), undefined);
  assert.equal(registry.forEmoji('🔳'), undefined);
  assert.equal(copy.forEmoji('🟦'), tile);
  copy.reset([{ ...tile, legacyEmojis: undefined }]);
  assert.equal(copy.forEmoji('🟦'), undefined);
});

test('legacy identities cannot collide with primary or other legacy identities', () => {
  const other = { ...tile, type: 'test.other', emoji: '🌷', legacyEmojis: ['🟦'] };
  for (const definitions of [
    [tile, other],
    [other, tile],
    [tile, { ...other, emoji: '🟦', legacyEmojis: [] }],
  ]) {
    assert.throws(() => new ObjectRegistry(definitions), /Duplicate/);
  }
  for (const legacyEmojis of [['🔳'], ['🟦', '🟦'], [''], [12], '🟦', Array(9).fill('🟦')]) {
    assert.throws(() => new ObjectRegistry([{ ...tile, legacyEmojis }]), /legacy/);
  }
});

test('portable configuration fills only missing fields from valid defaults', () => {
  const configurable = {
    ...tile,
    initial: () => ({ color: 'blue' }),
    configuration: { action: 'configure', fields: ['color'] },
    actions: {
      configure: { permission: 'editor', run: (_state, payload) => ({ color: payload.color }) },
    },
  };
  const registry = new ObjectRegistry([configurable]);
  const instance = { id: 'legacy-tile-instance', type: tile.type, version: 1, state: {} };
  assert.deepEqual(registry.configuration(instance).values, { color: 'blue' });
  assert.deepEqual(instance.state, {});
  assert.deepEqual(registry.configuration({ ...instance, state: { color: 'pink' } }).values, {
    color: 'pink',
  });
});
