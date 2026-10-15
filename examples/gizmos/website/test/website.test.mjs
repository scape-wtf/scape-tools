import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { website } from '../dist/definition.js';

test('floored is a fixed developer-authored source with no configurable URL or actions', () => {
  const registry = new ObjectRegistry([website]);
  const instance = registry.create('🌐', '00000000-0000-4000-8000-000000000001');
  assert.deepEqual(instance.state, {});
  assert.equal(website.web.url, 'https://floored.app/');
  assert.equal(website.web.context, undefined, 'ordinary sites receive no Scape context');
  assert.equal(website.configuration, undefined);
  assert.equal(website.view, undefined);
  assert.deepEqual(website.actions, {});
  assert.equal(website.valid({ url: 'https://other.example/' }), false);
  assert.equal(registry.configuration(instance), undefined);
  assert.throws(() =>
    registry.act(
      instance,
      { name: 'configure', payload: { url: 'https://other.example/' } },
      { actorId: 'owner', canEdit: true, now: 0, randomInt: () => 0 },
    ),
  );
});

test('floored bundles its app icon as a valid sprite without remote image requests', async () => {
  const { resolveGizmoSprite } = await import('@scape-wtf/sdk');
  const recipe = resolveGizmoSprite(website, {});
  assert.equal(website.label, 'floored');
  assert.equal(recipe.size, 192);
  const image = recipe.layers[0].shapes[0];
  assert.equal(image.kind, 'image');
  assert.deepEqual(
    [...Buffer.from(image.png, 'base64').subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(image.width, 192);
  assert.equal(image.height, 192);
});
