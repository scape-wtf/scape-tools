import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validGizmoWebView,
  validGizmoWebUrl,
  validObjectView,
  gizmoWebRoomAllowed,
} from '../dist/index.js';

test('web views accept bounded HTTPS or static HTML and reject ambiguous or executable URLs', () => {
  for (const url of ['https://game.example/room?id=1', 'https://game.example:8443/embed'])
    assert.equal(validGizmoWebUrl(url), true);
  for (const url of [
    'http://game.example',
    '//game.example',
    'javascript:alert(1)',
    'data:text/html,x',
    'https://u:p@game.example',
    'https://game.example\\@evil.example',
    'https://game.example/\nx',
    'https://game.example:99999',
  ])
    assert.equal(validGizmoWebUrl(url), false, url);
  const view = {
    title: 'Game',
    url: 'https://game.example',
    context: true,
    data: { score: 2 },
    actions: ['score'],
  };
  assert.equal(validGizmoWebView(view), true);
  assert.equal(validObjectView({ title: '', description: '', controls: [], web: view }), true);
  assert.equal(validGizmoWebView({ title: 'Card', html: '<b>Hello</b>' }), true);
  for (const extra of [
    { html: '<b>both</b>' },
    { title: '' },
    { data: { token: undefined } },
    { data: { tooLarge: 'x'.repeat(8192) } },
    { context: false },
    { actions: ['score', 'score'] },
    { allowSameOrigin: true },
  ]) {
    assert.equal(validGizmoWebView({ ...view, ...extra }), false);
  }
  assert.equal(validGizmoWebView({ title: 'Card', html: 'x'.repeat(16385) }), false);
  assert.equal(validGizmoWebView({ title: 'Card', html: 'x', context: true }), false);
});

test('room allow/deny policies fail closed and deny takes precedence', () => {
  const view = {
    title: 'Game',
    url: 'https://game.example',
    rooms: { allow: ['a', 'b'], deny: ['b'] },
  };
  assert.equal(validGizmoWebView(view), true);
  assert.equal(gizmoWebRoomAllowed(view, 'a'), true);
  for (const id of ['b', 'c', null]) assert.equal(gizmoWebRoomAllowed(view, id), false);
  assert.equal(gizmoWebRoomAllowed({ ...view, rooms: { allow: [] } }, 'a'), false);
  assert.equal(gizmoWebRoomAllowed({ ...view, rooms: undefined }, null), true);
  assert.equal(validGizmoWebView({ ...view, rooms: { allow: ['a'.repeat(129)] } }), false);
});
