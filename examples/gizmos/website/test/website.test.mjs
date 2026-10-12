import assert from 'node:assert/strict';
import test from 'node:test';
import { validObjectView } from '@scape-wtf/sdk';
import { website } from '../dist/definition.js';

test('website persists one shared HTTPS URL and exposes configuration only to editors', () => {
  const state = website.actions.configure.run(
    website.initial(),
    { url: 'https://game.example/match/123' },
    {},
  );
  assert.equal(website.valid(state), true);
  assert.equal(website.actions.configure.permission, 'editor');
  const view = website.view(state, { actorId: 'visitor', canEdit: false });
  assert.equal(validObjectView(view), true);
  assert.equal(view.web.url, state.url);
  assert.equal(view.web.context, true);
  assert.deepEqual(view.controls, []);
  assert.equal(website.view(state, { actorId: 'editor', canEdit: true }).controls.length, 1);
  assert.equal(
    validObjectView(website.view(website.initial(), { actorId: 'visitor', canEdit: false })),
    true,
  );
  for (const url of [
    'javascript:alert(1)',
    'http://game.example',
    'https://user:password@game.example',
  ]) {
    assert.equal(website.valid({ url }), false);
    assert.throws(() => website.actions.configure.run({}, { url }, {}));
  }
});
