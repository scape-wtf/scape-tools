import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validGizmoWebView,
  validGizmoWebUrl,
  validObjectView,
  gizmoWebRoomAllowed,
  validGizmoWebDefinition,
  resolveGizmoWebView,
  boundedJsonData,
} from '../dist/index.js';

test('fullscreen is an optional boolean on website, static and interactive HTML declarations', () => {
  for (const source of [
    { url: 'https://example.com' },
    { html: '<p>Static</p>' },
    { html: '<p>Interactive</p>', interactive: true },
  ]) {
    for (const fullscreen of [undefined, true, false]) {
      const web = {
        title: 'Panel',
        ...source,
        ...(fullscreen === undefined ? {} : { fullscreen }),
      };
      assert.equal(validGizmoWebDefinition(web), true);
      assert.equal(resolveGizmoWebView({ web }, {}).fullscreen !== false, fullscreen !== false);
    }
    for (const fullscreen of [null, 0, 1, 'false', {}, []])
      assert.equal(validGizmoWebDefinition({ title: 'Panel', ...source, fullscreen }), false);
  }
});

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
  assert.equal(validObjectView({ title: '', description: '', controls: [], web: view }), false);
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

test('BUG-240: browser-invalid numeric hosts never become fixed web declarations', () => {
  for (const url of [
    'https://example.123',
    'https://999.999.999.999',
    'https://4294967296',
    'https://xn--a.example',
  ]) {
    assert.throws(() => new URL(url));
    assert.equal(validGizmoWebDefinition({ title: 'Invalid site', url }), false, url);
  }
  for (const url of ['https://127.0.0.1', 'https://xn--bcher-kva.example'])
    assert.equal(validGizmoWebUrl(url), true, url);
  for (const url of ['https://127.1', 'https://0x7f000001', 'https://127.0.0.01'])
    assert.equal(validGizmoWebUrl(url), false, 'noncanonical IPv4 is not a developer source');
});

test('BUG-241: bounded JSON rejects aliases, cycles, deep and oversized data without expanding them', () => {
  let graph = { value: 1 };
  for (let level = 0; level < 7; level++) graph = { branches: Array(100).fill(graph) };
  assert.equal(boundedJsonData(structuredClone(graph), 2048), false);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(boundedJsonData(cyclic, 2048), false);
  assert.equal(boundedJsonData({ big: 'x'.repeat(1000000) }, 2048), false);
  let deep = {};
  for (let i = 0; i < 17; i++) deep = { child: deep };
  assert.equal(boundedJsonData(deep, 2048), false);
  assert.equal(
    validGizmoWebView({ title: 'Site', url: 'https://example.com', context: true, data: graph }),
    false,
  );
  assert.equal(
    validObjectView({ title: '', description: '', controls: [], webData: graph }),
    false,
  );
  for (const value of [
    null,
    true,
    false,
    0,
    -0,
    1e-8,
    '',
    '\\"\n',
    '\ud800',
    '🧩',
    [],
    {},
    { nested: [{ a: 1 }, { a: 1 }], text: '\t' },
  ]) {
    const length = JSON.stringify(value).length;
    assert.equal(boundedJsonData(value, length), true);
    assert.equal(boundedJsonData(value, length - 1), false);
  }
  for (const value of [undefined, NaN, Infinity, 1n, () => {}, new Date()])
    assert.equal(boundedJsonData(value, 2048), false);
});

test('interactive HTML explicitly opts into scripts and a bounded public bridge', () => {
  const panel = {
    title: 'Panel',
    html: '<button>Go</button>',
    interactive: true,
    context: true,
    data: { count: 1 },
    actions: ['increment'],
  };
  assert.equal(validGizmoWebView(panel), true);
  assert.equal(validObjectView({ title: '', description: '', controls: [], web: panel }), false);
  for (const extra of [
    { interactive: false },
    { interactive: 'yes' },
    { context: false },
    { html: 'x'.repeat(16385) },
    { actions: ['remove', 'remove'] },
    { url: 'https://example.com' },
    { allowSameOrigin: true },
    { network: true },
  ]) {
    assert.equal(
      validGizmoWebView({ ...panel, ...extra }),
      false,
      JSON.stringify(extra).slice(0, 100),
    );
  }
  assert.equal(validGizmoWebView({ title: 'Static', html: 'hello', interactive: false }), true);
  assert.equal(validGizmoWebView({ title: 'Local', html: 'hello', interactive: true }), true);
  assert.equal(
    validGizmoWebView({ title: 'Site', url: 'https://example.com', interactive: false }),
    false,
  );
});

test('sources belong to definitions and changing view data cannot replace them', () => {
  const definition = {
    web: { title: 'Custom site', url: 'https://developer.example/app', context: true },
  };
  assert.equal(validGizmoWebDefinition(definition.web), true);
  assert.equal(validGizmoWebDefinition({ ...definition.web, data: {} }), false);
  assert.equal(
    validGizmoWebDefinition(() => definition.web),
    false,
  );
  const view = {
    title: '',
    description: '',
    controls: [],
    webData: { url: 'https://evil.example' },
  };
  assert.equal(validObjectView(view), true);
  assert.equal(resolveGizmoWebView(definition, view).url, 'https://developer.example/app');
  assert.deepEqual(resolveGizmoWebView(definition, view).data, view.webData);
  assert.equal(validObjectView({ ...view, webData: { x: 'x'.repeat(8192) } }), false);
  assert.equal(validObjectView({ ...view, webData: { secret: undefined } }), false);
  assert.equal(
    resolveGizmoWebView({ web: { title: 'Private', html: 'hello' } }, view).data,
    undefined,
  );
});
