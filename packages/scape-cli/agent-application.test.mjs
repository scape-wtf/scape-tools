import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { agentApplication } from './agent-application.mjs';

async function fixture(t, runManaged, autoStart = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-app-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let dispatch;
  const events = [],
    notices = [];
  const view = {
    state: value => events.push(value),
    event() {},
    notice: value => notices.push(value),
    log() {},
    suspend() {},
    resume() {},
    close: () => events.push('closed'),
  };
  const promise = agentApplication(
    { directory, autoStart },
    {
      createDashboard({ onAction }) {
        dispatch = onAction;
        return view;
      },
      createUI() {
        return { close() {} };
      },
      runManaged,
    },
  );
  return { promise, events, notices, action: value => dispatch(value) };
}

test('dashboard startup, stop and quit share one runtime and release it before closing', async t => {
  let calls = 0,
    started;
  const ready = new Promise(resolve => {
    started = resolve;
  });
  const f = await fixture(t, async (_, options) => {
    calls++;
    options.onReady();
    started();
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
  });
  await ready;
  await f.action('start');
  assert.equal(calls, 1);
  await f.action('configure');
  assert.match(f.notices.at(-1), /Stop the agent/);
  await f.action('quit');
  await f.promise;
  assert.deepEqual(f.events.slice(-2), ['stopped', 'closed']);
});

test('access revocation exits the terminal application and preserves the error', async t => {
  const f = await fixture(t, async () => {
    throw Object.assign(new Error('Access revoked'), { code: 'access_revoked', status: 403 });
  });
  await assert.rejects(f.promise, { code: 'access_revoked' });
  assert.equal(f.events.at(-1), 'closed');
});

test('opening the home screen does not start inference or enter the world', async t => {
  let calls = 0;
  const f = await fixture(
    t,
    async () => {
      calls++;
    },
    false,
  );
  await new Promise(setImmediate);
  await f.action('quit');
  await f.promise;
  assert.equal(calls, 0);
  assert.equal(f.events.at(-1), 'closed');
});
