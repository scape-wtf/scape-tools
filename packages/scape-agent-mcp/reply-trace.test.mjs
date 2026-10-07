import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, mkdir, writeFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openReplyTrace } from './reply-trace.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-reply-trace-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    folder: path.join(directory, '.scape-traces'),
    file: path.join(directory, '.scape-traces/replies.jsonl'),
  };
}
test(
  'BUG-175: private reply traces redact known credentials, preserve context and serialize writes',
  { skip: process.platform === 'win32' },
  async t => {
    const { directory, folder, file } = await fixture(t);
    const messages = [];
    const trace = await openReplyTrace({
      directory,
      secrets: ['PRIVATE_API_KEY', 'PRIVATE_GRANT'],
      log: message => messages.push(message),
    });
    await Promise.all([
      trace.write({
        state: {
          draft: 'Hey! PRIVATE_API_KEY',
          target: { message: 'whatsup' },
          token: 'another secret',
          body: 'PRIVATE_GRANT',
        },
        verdict: { accepted: true },
      }),
      trace.write({
        state: { draft: 'control\u001b[2J\nnext line' },
        verdict: { accepted: false },
      }),
    ]);
    await trace.close();
    const text = await readFile(file, 'utf8');
    const records = text
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.equal(records[0].state.target.message, 'whatsup');
    assert.equal(records[0].state.draft, 'Hey! [redacted]');
    assert.doesNotMatch(
      text + messages.join(''),
      /PRIVATE_API_KEY|PRIVATE_GRANT|another secret|\u001b/,
    );
    assert.equal((await stat(folder)).mode & 0o777, 0o700);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  },
);

test(
  'BUG-175: trace size is bounded across writes and restarts without affecting the agent',
  { skip: process.platform === 'win32' },
  async t => {
    const { directory, file } = await fixture(t);
    const messages = [];
    let trace = await openReplyTrace({ directory, log: message => messages.push(message) });
    await trace.write({ draft: 'x'.repeat(700000) });
    await trace.write({ draft: 'y'.repeat(700000) });
    await trace.write({ draft: 'never appended after full' });
    await trace.close();
    const first = await readFile(file, 'utf8');
    assert.ok(Buffer.byteLength(first) < 1024 * 1024);
    assert.equal(first.trim().split('\n').length, 1);
    assert.equal(messages.filter(message => message.includes('unavailable or full')).length, 1);
    trace = await openReplyTrace({ directory });
    await trace.write({ draft: 'z'.repeat(700000) });
    await trace.close();
    assert.equal(await readFile(file, 'utf8'), first);
  },
);

test(
  'BUG-175: tracing refuses symlinks, hardlinks and shared files without modifying them',
  { skip: process.platform === 'win32' },
  async t => {
    for (const kind of ['symlink', 'hardlink', 'shared']) {
      const { directory, folder, file } = await fixture(t);
      await mkdir(folder, { mode: 0o700 });
      const target = path.join(directory, 'original');
      await writeFile(target, 'unchanged', { mode: 0o600 });
      if (kind === 'symlink') await symlink(target, file);
      else if (kind === 'hardlink') await link(target, file);
      else await writeFile(file, 'unchanged', { mode: 0o644 });
      const trace = await openReplyTrace({ directory });
      await trace.write({ draft: 'must not write' });
      await trace.close();
      assert.equal(await readFile(target, 'utf8'), 'unchanged');
      assert.equal(await readFile(file, 'utf8'), 'unchanged');
    }
  },
);
