import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectActionError, resolveGizmoSprite, validObjectView } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { walkableTile } from '../dist/definition.js';

const registry = new ObjectRegistry([walkableTile]);
const context = { actorId: 'owner', canEdit: true, now: 0, randomInt: () => 0 };
const create = () => registry.create(walkableTile.emoji, 'walkable-example-instance');
const appearance = emoji => ({ name: 'appearance', payload: { emoji } });

test('a tile starts as 🔳 and stays walkable without push or arrival effects', () => {
  assert.equal(walkableTile.emoji, '🔳');
  assert.deepEqual(create().state, { emoji: '🔳' });
  assert.equal(walkableTile.valid({ unexpected: true }), false);
  assert.equal(walkableTile.walkable, true);
  assert.equal(walkableTile.push, undefined);
  assert.equal(walkableTile.step, undefined);
  assert.equal(resolveGizmoSprite(walkableTile, create().state).layers[0].shapes[0].text, '🔳');
});

test('appearance accepts complete emoji sequences without acquiring their behavior', () => {
  const original = create();
  for (const emoji of ['🌷', '🔥', '🚪', '👍🏽', '👩🏽‍💻', '👨‍👩‍👧‍👦', '🇨🇦', '1️⃣', '❤️']) {
    const changed = registry.act(original, appearance(emoji), context);
    assert.deepEqual(changed.state, { emoji });
    assert.equal(changed.type, original.type);
    assert.equal(changed.id, original.id);
    assert.equal(resolveGizmoSprite(walkableTile, changed.state).layers[0].shapes[0].text, emoji);
    assert.equal(walkableTile.walkable, true);
  }
  assert.deepEqual(original.state, { emoji: '🔳' });
  assert.deepEqual(registry.act(original, appearance(' 🌷 '), context).state, { emoji: '🌷' });
});

test('only editors receive the field or may save an appearance', () => {
  const original = create();
  assert.equal(walkableTile.editPolicy, 'placer-admin');
  const visitor = { ...context, actorId: 'visitor', canEdit: false };
  assert.throws(() => registry.act(original, appearance('🌷'), visitor), /cannot perform/);
  const readOnly = walkableTile.view(original.state, visitor);
  assert.deepEqual(readOnly.fields, []);
  assert.deepEqual(readOnly.controls, []);
  const editor = walkableTile.view(original.state, context);
  assert.equal(validObjectView(editor), true);
  assert.equal(editor.fields[0].value, '🔳');
  assert.deepEqual(editor.controls[0].fields, ['emoji']);
  assert.equal(editor.fields[0].kind, 'emoji');
  assert.equal(
    editor.controls[0].trigger,
    'change',
    'the native picker saves a deliberate selection',
  );
});

test('invalid and oversized values cannot become saved tile state', () => {
  for (const emoji of [
    '',
    ' ',
    'hello',
    '1',
    '🌷🌻',
    '🌷\n🌻',
    '<img>',
    '\u200d',
    '🌷'.repeat(40),
    null,
    12,
  ]) {
    assert.equal(walkableTile.valid({ emoji }), false);
    assert.throws(
      () => registry.act(create(), appearance(emoji), context),
      error => error instanceof ObjectActionError && error.status === 400,
    );
  }
  assert.throws(() =>
    registry.act(create(), { name: 'appearance', payload: { emoji: '🌷', extra: true } }, context),
  );
  assert.equal(walkableTile.valid({ emoji: '🌷', extra: true }), false);
});

test('copying configuration preserves appearance without copying instance identity', () => {
  const original = registry.act(create(), appearance('🌷'), context);
  const copy = registry.configure(
    registry.create(walkableTile.emoji, 'walkable-copy-instance'),
    registry.configuration(original),
    context,
  );
  assert.deepEqual(copy.state, original.state);
  assert.notEqual(copy.id, original.id);
});

test('old blue tiles with empty saved state remain valid, configurable and copyable', () => {
  const legacy = { id: 'walkable-legacy-instance', type: walkableTile.type, version: 1, state: {} };
  assert.equal(registry.forEmoji('🟦'), walkableTile);
  assert.equal(registry.validate(legacy), true);
  assert.equal(walkableTile.view(legacy.state, context).fields[0].value, '🔳');
  assert.equal(resolveGizmoSprite(walkableTile, legacy.state).layers[0].shapes[0].text, '🔳');
  assert.deepEqual(registry.configuration(legacy).values, { emoji: '🔳' });
  assert.deepEqual(registry.act(legacy, appearance('🌷'), context).state, { emoji: '🌷' });
  assert.deepEqual(legacy.state, {}, 'reading or editing never mutates the old snapshot');
});
