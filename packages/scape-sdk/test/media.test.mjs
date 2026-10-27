import assert from 'node:assert/strict';
import test from 'node:test';
import { defineObject, record, validGizmoMediaChannel } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const definition = defineObject({
  type: 'test.media',
  version: 1,
  emoji: '📺',
  label: 'Media',
  hint: '',
  initial: () => ({ channel: null }),
  valid: record,
  media: { kind: 'live-tv', field: 'channel', action: 'tune' },
  actions: { tune: { permission: 'editor', run: (_state, payload) => payload } },
});

test('host media declarations reject URL state and participant tuning', () => {
  assert.equal(validGizmoMediaChannel('NHKWorldJapan.jp~SD'), true);
  assert.equal(validGizmoMediaChannel('https://example.com'), false);
  for (const change of [
    { media: { ...definition.media, action: 'missing' } },
    { actions: { tune: { permission: 'participant', run: (_state, payload) => payload } } },
    { initial: () => ({ channel: 'https://example.com' }) },
    { media: { ...definition.media, url: 'https://example.com' } },
  ])
    assert.throws(() => new ObjectRegistry([{ ...definition, ...change }]));
});

test('generic state validation also checks media after actions and imports', () => {
  const registry = new ObjectRegistry([definition]);
  const instance = registry.create('📺', 'media-instance-one');
  assert.equal(
    registry.validate({ ...instance, state: { channel: 'https://example.com' } }),
    false,
  );
  assert.throws(() =>
    registry.act(
      instance,
      { name: 'tune', payload: { channel: 'https://example.com' } },
      { actorId: 'owner', canEdit: true, now: 0, randomInt: () => 0 },
    ),
  );
});
