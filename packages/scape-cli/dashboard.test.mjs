import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { dashboard, supportsDashboard, fitLine } from './dashboard.mjs';
function fixture(env = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = value => {
    input.isRaw = value;
  };
  let text = '';
  const output = new Writable({
    write(chunk, _, done) {
      text += chunk;
      done();
    },
  });
  output.isTTY = true;
  output.columns = 80;
  output.rows = 24;
  const actions = [];
  const view = dashboard({ input, output, env, onAction: action => actions.push(action) });
  return {
    input,
    output,
    view,
    actions,
    get text() {
      return text;
    },
    key(name, text = name) {
      input.emit('keypress', text, { name });
    },
  };
}
const frame = () => new Promise(resolve => setTimeout(resolve, 60));
test('dashboard restores terminal raw mode, cursor, listeners and alternate screen even after suspension', () => {
  const f = fixture();
  assert.equal(f.input.isRaw, true);
  f.view.suspend();
  assert.equal(f.input.isRaw, false);
  assert.equal(f.input.listenerCount('keypress'), 0);
  f.view.resume();
  f.view.close();
  f.view.close();
  assert.equal(f.input.isRaw, false);
  assert.equal(f.output.listenerCount('resize'), 0);
  assert.equal(f.input.listenerCount('keypress'), 0);
  assert.match(f.text, /\x1b\[\?1049l$/);
  f.input.destroy();
});
test('live health, budgets, tabs and owner controls work without debug log strings', async () => {
  const f = fixture({ NO_COLOR: '' });
  f.view.event({ type: 'identity', name: 'Scout', conversation: 'test', conversationLimit: 0 });
  f.view.event({
    type: 'diagnostic',
    event: 'conversation_request',
    phase: 'start',
    calls: 8,
    limit: 0,
  });
  f.view.event({
    type: 'diagnostic',
    event: 'conversation_request',
    phase: 'failed',
    status: 429,
    reason: 'provider_http_error',
  });
  await frame();
  assert.match(f.text, /8 requests \/ unlimited/);
  assert.match(f.text, /HTTP 429/);
  assert.doesNotMatch(f.text, /38;2/);
  f.key('k');
  assert.deepEqual(f.actions, ['cancel-task']);
  f.key('3');
  f.view.event({ type: 'memory', notes: [{ id: 'one', text: 'Likes music', room: 'dev' }] });
  f.key('f');
  f.key('n');
  assert.equal(f.actions.length, 1);
  f.key('f');
  f.key('y');
  assert.deepEqual(f.actions.at(-1), { type: 'forget', id: 'one' });
  f.view.close();
  f.input.destroy();
});
test('output is sanitized, bounded and responds to terminal resize', async () => {
  const f = fixture();
  f.key('4');
  f.view.log('Unsafe\x1b\u202e title');
  f.output.columns = 20;
  f.output.rows = 7;
  f.output.emit('resize');
  await frame();
  assert.match(f.text, /Scape · resize/);
  assert.doesNotMatch(f.text, /\u202e/);
  assert.equal(fitLine('👹abc', 3), '👹a');
  assert.equal(
    supportsDashboard({ input: { isTTY: false }, output: { isTTY: true }, env: {} }),
    false,
  );
  assert.equal(
    supportsDashboard({ input: { isTTY: true }, output: { isTTY: true }, env: { TERM: 'dumb' } }),
    false,
  );
  f.view.close();
  f.input.destroy();
});

test('FR-181: bounded task windows retain full totals and original step numbers', async () => {
  const f = fixture();
  try {
    f.key('2');
    f.view.event({
      type: 'tasks',
      tasks: [
        {
          status: 'running',
          completed: 300,
          total: 400,
          steps: [{ action: 'place', label: 'Brick at 12,20', index: 300, status: 'pending' }],
        },
      ],
    });
    await frame();
    assert.match(f.text, /300\/400 steps/);
    assert.match(f.text, /301\. place Brick at 12,20/);
  } finally {
    f.view.close();
    f.input.destroy();
  }
});
