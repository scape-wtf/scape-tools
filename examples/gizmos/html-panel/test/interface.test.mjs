import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { htmlPanel } from '../dist/definition.js';
const panelHtml = htmlPanel.web.html;

// Plain Node fixtures exercise the bundled message/input logic without a browser.
function terminal() {
  const element = () => ({
    value: '',
    textContent: '',
    disabled: true,
    dataset: {},
    handlers: {},
    addEventListener(name, callback) {
      this.handlers[name] = callback;
    },
  });
  const ids = Object.fromEntries(
    ['code', 'submit', 'status', 'output', 'clear', 'back'].map(id => [id, element()]),
  );
  const digits = Array.from({ length: 10 }, (_, digit) => ({
    ...element(),
    dataset: { digit: String(digit) },
  }));
  const parent = {},
    handlers = {},
    sent = [];
  const port = {
    onmessage: null,
    postMessage(message) {
      sent.push(message);
    },
    start() {},
  };
  vm.runInNewContext(panelHtml.match(/<script>([\s\S]*)<\/script>/)[1], {
    window: {
      parent,
      addEventListener(name, callback) {
        handlers[name] = callback;
      },
    },
    document: {
      body: { dataset: {} },
      getElementById: id => ids[id],
      querySelectorAll: () => digits,
    },
  });
  const connect = source =>
    handlers.message({
      source,
      data: { protocol: 'scape.web.v1', type: 'connect' },
      ports: [port],
    });
  const receive = data => port.onmessage({ data: { protocol: 'scape.web.v1', ...data } });
  const context = solved => receive({ type: 'context', data: { solved }, actions: ['submit'] });
  return { ids, digits, parent, handlers, port, sent, connect, receive, context };
}

test('terminal waits for the host, submits only a bounded code and ignores stale replies', () => {
  const f = terminal();
  f.connect({});
  assert.equal(f.port.onmessage, null, 'unrelated windows cannot supply a bridge');
  f.connect(f.parent);
  assert.equal(f.ids.code.disabled, true, 'wait for authorized context');
  f.context(false);
  f.ids.code.value = 'x31429';
  f.ids.code.handlers.input();
  assert.equal(f.ids.code.value, '3142');
  f.ids.submit.handlers.click();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].name, 'submit');
  assert.equal(f.sent[0].payload.code, '3142');
  assert.equal(f.ids.submit.disabled, true);
  f.ids.submit.handlers.click();
  assert.equal(f.sent.length, 1);
  f.receive({ type: 'result', id: 'unrelated', ok: true });
  assert.equal(f.ids.code.disabled, true);
  f.context(true);
  f.receive({ type: 'result', id: f.sent[0].id, ok: true });
  assert.equal(f.ids.submit.disabled, true);
  assert.equal(f.ids.output.textContent, 'Output active');
  f.context(false);
  assert.equal(f.ids.code.value, '');
  assert.equal(f.ids.code.disabled, false);
  f.handlers.keydown({ key: 'Escape' });
  assert.equal(f.sent[1].type, 'close');
});

test('keypad supports correction and a failed host request permits retry', () => {
  const f = terminal();
  f.connect(f.parent);
  f.context(false);
  for (const digit of [3, 1, 4, 9]) f.digits[digit].handlers.click();
  assert.equal(f.ids.code.value, '3149');
  assert.equal(f.digits[2].disabled, true);
  f.ids.back.handlers.click();
  f.digits[2].handlers.click();
  assert.equal(f.ids.code.value, '3142');
  f.handlers.keydown({ key: 'Enter', target: f.ids.code, preventDefault() {} });
  f.receive({ type: 'result', id: f.sent[0].id, ok: false });
  assert.equal(f.ids.submit.disabled, false);
  assert.match(f.ids.status.textContent, /Try again/);
  f.ids.clear.handlers.click();
  assert.equal(f.ids.code.value, '');
  assert.equal(f.ids.submit.disabled, true);
});
