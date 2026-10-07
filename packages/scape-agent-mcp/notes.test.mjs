import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, chmod, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openConversationNotes } from './notes.mjs';
import { parseAgentConfig } from './runner-config.mjs';
const identity = { origin: 'https://scape.wtf', room: 'dev-test', agent: 'Scout' };
async function folder(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-notes-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('notes default off and persist only within their visitor/world/agent/origin scope', async t => {
  assert.equal(
    parseAgentConfig({ name: 'Scout', provider: { type: 'ollama', model: 'test' } }).memory
      .conversationNotes,
    false,
  );
  const directory = await folder(t);
  let store = await openConversationNotes({ directory });
  await store.scope(identity).remember('player', 'I like music');
  assert.deepEqual(store.scope(identity).list('player'), ['I like music']);
  for (const change of [{ room: 'another' }, { agent: 'other' }, { origin: 'https://other.test' }])
    assert.deepEqual(store.scope({ ...identity, ...change }).list('player'), []);
  assert.deepEqual(store.scope(identity).list('other-player'), []);
  await store.close();
  assert.equal((await stat(path.join(directory, '.scape-notes/notes.json'))).mode & 0o777, 0o600);
  assert.doesNotMatch(
    await readFile(path.join(directory, '.scape-notes/notes.json'), 'utf8'),
    /"player"/,
  );
  store = await openConversationNotes({ directory });
  assert.equal(store.list().length, 1);
  await store.forget(store.list()[0].id);
  await store.close();
  store = await openConversationNotes({ directory, readOnly: true });
  assert.deepEqual(store.list(), []);
  await store.close();
});
test('notes are bounded, expire and cannot have concurrent writers', async t => {
  const directory = await folder(t);
  let now = 1000;
  const store = await openConversationNotes({ directory, now: () => now });

  await assert.rejects(openConversationNotes({ directory }), /already open/);
  const scope = store.scope(identity);
  await assert.rejects(scope.remember('player', 'x'.repeat(501)));
  for (let i = 0; i < 21; i++) await scope.remember('player', `Note ${i}`);
  assert.equal(scope.list('player').length, 20);
  assert.equal(scope.list('player')[0], 'Note 1');
  now += 30 * 86400000;
  assert.deepEqual(scope.list('player'), []);
  await store.close();
});
test('unsafe permissions and symlink files fail closed', async t => {
  const directory = await folder(t);
  const store = await openConversationNotes({ directory });
  await store.scope(identity).remember('player', 'A note');
  await store.close();
  const file = path.join(directory, '.scape-notes/notes.json');
  await chmod(file, 0o644);
  await assert.rejects(openConversationNotes({ directory }), /Cannot read/);
  await rm(file);
  await symlink('/etc/hosts', file);
  await assert.rejects(openConversationNotes({ directory }), /Cannot read/);
});
