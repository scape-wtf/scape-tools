import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { terminal, Back, Cancelled } from './terminal.mjs';
const choices = [
  { value: 'one', label: 'First option' },
  { value: 'two', label: 'Second option' },
  { value: 'three', label: 'Third option' },
];
function fixture(env = { TERM: 'xterm' }, outputTTY = true) {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = value => (input.isRaw = value);
  let text = '';
  const output = new Writable({
    write(chunk, _, done) {
      text += chunk;
      done();
    },
  });
  output.isTTY = outputTTY;
  output.columns = 54;
  output.rows = 14;
  return {
    ui: terminal({ input, output, env }),
    input,
    output,
    get text() {
      return text;
    },
    key(name, sequence = '') {
      input.emit('keypress', sequence, { name, sequence });
    },
  };
}
test('pairing codes use four-character groups matching the UI in rich and plain terminals', () => {
  for (const env of [{ TERM: 'xterm' }, { TERM: 'xterm', NO_COLOR: '' }]) {
    for (const code of ['3E918DFED133', '3E91 8DFE D133']) {
      const f = fixture(env);
      f.ui.code(code);
      assert.ok(f.text.includes('│  3E91 8DFE D133        │'));
      assert.doesNotMatch(f.text, /3E918DFED133/);
      f.input.destroy();
    }
  }
});
test('pairing code grouping preserves a shorter final group', () => {
  const f = fixture();
  f.ui.code('ABCDEF');
  assert.match(f.text, /ABCD EF/);
  f.input.destroy();
});
test('browser links preserve the complete destination on narrow terminals and close hyperlink styling', () => {
  const f = fixture();
  const url = 'https://staging.scape.wtf/?playground=1&developer-connect=TEST12345678';
  f.output.columns = 24;
  f.ui.link(url);
  f.ui.line('Verify this code');
  assert.ok(f.text.includes(`\x1b]8;;${url}\x1b\\`));
  assert.ok(f.text.includes(`m${url}\x1b[0m\x1b]8;;\x1b\\\n`));
  assert.match(f.text, /Open in your browser/);
  assert.match(f.text, /Cmd\/Ctrl-click/);
  assert.ok(f.text.endsWith('  Verify this code\n'));
  f.input.destroy();
});
test('browser links remain complete plain text when redirected or styling is disabled', () => {
  for (const [env, outputTTY] of [
    [{ TERM: 'xterm' }, false],
    [{ TERM: 'dumb' }, true],
    [{ TERM: 'xterm', NO_COLOR: '' }, true],
  ]) {
    const f = fixture(env, outputTTY);
    const url = 'https://scape.wtf/?playground=1&developer-connect=TEST12345678';
    f.ui.link(url);
    assert.ok(f.text.includes(`  ${url}\n`));
    assert.doesNotMatch(f.text, /\x1b/);
    f.input.destroy();
  }
});
test('browser links reject non-web destinations and sanitize terminal control characters', () => {
  const f = fixture();
  assert.throws(() => f.ui.link('javascript:alert(1)'), /HTTP or HTTPS/);
  assert.throws(() => f.ui.link('not a URL'), TypeError);
  assert.equal(f.text, '');
  f.ui.link('https://scape.wtf/\x07\n\u202e');
  assert.ok(f.text.includes('\x1b]8;;https://scape.wtf/\x1b\\'));
  assert.doesNotMatch(f.text, /\x07|\u202e/);
  f.input.destroy();
});
test('arrow keys, space and enter select an option and restore terminal state', async () => {
  const f = fixture();
  const selected = f.ui.choose('Provider', choices, 'one');
  f.key('down');
  f.key('space', ' ');
  assert.equal(await selected, 'two');
  assert.equal(f.input.isRaw, false);
  assert.equal(f.input.listenerCount('keypress'), 0);
  assert.match(f.text, /↑↓ Move/);
  assert.match(f.text, /\x1b\[\?25h/);
  const again = f.ui.choose('Provider', choices, 'two');
  f.key('up');
  f.key('return');
  assert.equal(await again, 'one');
  f.input.destroy();
});
test('Escape goes back, cancellation restores cursor and resize keeps selection', async () => {
  const f = fixture();
  let prompt = f.ui.choose('Provider', choices, 'one', { canBack: true });
  f.key('down');
  f.output.columns = 24;
  f.output.emit('resize');
  f.key('escape');
  await assert.rejects(prompt, Back);
  assert.equal(f.input.isRaw, false);
  prompt = f.ui.choose('Provider', choices, 'two');
  f.ui.cancel();
  await assert.rejects(prompt, Cancelled);
  assert.equal(f.input.isRaw, false);
  f.input.destroy();
});
test('wizard can go back through text and secret fields without saving or exposing a key', async () => {
  const f = fixture();
  let runs = 0;
  const result = f.ui.wizard(async ui => {
    runs++;
    const name = await ui.ask('Name', { value: 'Scout' });
    const secret = await ui.ask('Secret', { secret: true });
    const option = await ui.choose('Choice', choices, 'one');
    return { name, secret, option };
  });
  f.input.write('Nova\r');
  await new Promise(setImmediate);
  f.input.write('PRIVATE_SECRET\r');
  await new Promise(setImmediate);
  f.key('escape');
  await new Promise(setImmediate);
  f.input.write('\r');
  await new Promise(setImmediate);
  f.key('down');
  f.key('return');
  assert.deepEqual(await result, { name: 'Nova', secret: 'PRIVATE_SECRET', option: 'two' });
  assert.equal(runs, 2);
  assert.doesNotMatch(f.text, /PRIVATE_SECRET/);
  assert.equal(f.input.isRaw, false);
  f.input.destroy();
});
test('changing an earlier option invalidates later credential defaults', async () => {
  const f = fixture();
  const result = f.ui.wizard(async ui => {
    const provider = await ui.choose('Provider', choices, 'one');
    const secret = await ui.ask('Secret', { secret: true });
    return { provider, secret };
  });
  f.key('return');
  await new Promise(setImmediate);
  f.input.write('OLD_KEY');
  f.key('escape');
  await new Promise(setImmediate);
  f.key('down');
  f.key('return');
  await new Promise(setImmediate);
  f.input.write('NEW_KEY\r');
  assert.deepEqual(await result, { provider: 'two', secret: 'NEW_KEY' });
  assert.doesNotMatch(f.text, /OLD_KEY|NEW_KEY/);
  f.input.destroy();
});
test('plain terminals retain keyboard selection without ANSI or animation', async () => {
  const f = fixture({ TERM: 'xterm', NO_COLOR: '' });
  const answer = f.ui.choose('Provider', choices, 'one');
  f.key('down');
  f.key('return');
  assert.equal(await answer, 'two');
  assert.doesNotMatch(f.text, /\x1b/);
  f.input.destroy();
});

test('review screen can jump to an earlier section with previous answers retained', async () => {
  const f = fixture();
  const result = f.ui.wizard(async ui => {
    const name = await ui.ask('Name', { value: 'Scout' });
    const option = await ui.choose('Choice', choices, 'one');
    const review = await ui.choose(
      'Review',
      [
        { value: 'save', label: 'Save settings' },
        { value: 'edit', label: 'Change name' },
      ],
      'save',
    );
    if (review === 'edit') ui.jump('Name');
    return { name, option };
  });
  f.input.write('Nova\r');
  await new Promise(setImmediate);
  f.key('down');
  f.key('return');
  await new Promise(setImmediate);
  f.key('down');
  f.key('return');
  await new Promise(setImmediate);
  f.input.write('\r');
  await new Promise(setImmediate);
  f.key('return');
  await new Promise(setImmediate);
  f.key('return');
  assert.deepEqual(await result, { name: 'Nova', option: 'two' });
  f.input.destroy();
});
