import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentBridge } from './bridge.mjs';
const flush = async () => { for (let i=0;i<25;i++) await Promise.resolve(); };
const snapshot = (revision = 1) => ({ protocol: 1, sessionId: 'session-one', revision, status: 'connected', self: { x: 2, y: 3, floor: 0 }, players: [] });
function fixture(options) {
  const calls = []; let publish, fail; let approved = true;
  const client = {
    pair: async name => { calls.push(['pair', name]); return { code: 'ABCD', expiresAt: Date.now()+300_000 }; },
    pairingStatus: async () => ({ approved }),
    enter: async () => { calls.push(['enter']); return snapshot(); },
    watch: (next, error) => { publish = next; fail = error; return () => calls.push(['unwatch']); },
    speak: async (...args) => { calls.push(['speak', ...args]); return { ok: true }; },
    moveTo: async (...args) => { calls.push(['move', ...args]); return { operationId: args[3] }; },
    stop: async id => { calls.push(['stop', id]); return { ok: true }; },
    leave: async () => { calls.push(['leave']); return { ok: true }; },
  };
  const bridge = new AgentBridge(client, options);
  return { bridge, client, calls, publish: value => publish(value), fail: () => fail(new Error('Offline')), approve: value => { approved = value; } };
}
test('pairing requires owner approval and concurrent enters share a single presence', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); f.approve(false);
  const first = await f.bridge.pair('Scout'); assert.deepEqual(await f.bridge.pair('Scout'), first);
  assert.equal(f.calls.filter(c => c[0] === 'pair').length, 1);
  assert.equal((await f.bridge.enter()).entered, false); assert.equal(f.calls.some(c => c[0] === 'enter'), false);
  f.approve(true); const results = await Promise.all([f.bridge.enter(),f.bridge.enter()]);
  assert.ok(results.every(r => r.entered)); assert.equal(f.calls.filter(c => c[0] === 'enter').length, 1);
  await assert.rejects(f.bridge.pair('Other'), /leave/);
});
test('observation waits wake on changes, cancel cleanly and reject after leave', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.enter();
  const waiting = f.bridge.observe({ afterRevision: 1, waitMs: 25_000 }); f.publish(snapshot(2)); assert.equal((await waiting).revision, 2);
  const abort = new AbortController(); const cancelled = f.bridge.observe({ afterRevision: 2, waitMs: 25_000 }, abort.signal);
  abort.abort(); await assert.rejects(cancelled, /cancelled/);
  const leaving = f.bridge.observe({ afterRevision: 2, waitMs: 25_000 }); const rejected = assert.rejects(leaving, /Left/);
  await f.bridge.leave(); await rejected;
});
test('stop invalidates queued intent and runs after the one action already in flight', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.enter();
  let release;
  f.client.moveTo = async () => { f.calls.push(['moving']); await new Promise(resolve => release = resolve); return { operationId: 'first' }; };
  const move = f.bridge.moveTo(3,3,0,'first'); await flush();
  const speech = f.bridge.speak('Late speech','second'); const cancelled = assert.rejects(speech, /cancelled/);
  const stop = f.bridge.stop('third'); release(); await move; await cancelled; await stop;
  assert.equal(f.calls.some(c => c[0] === 'speak'), false);
  assert.deepEqual(f.calls.filter(c => ['moving','stop'].includes(c[0])), [['moving'],['stop','third']]);
});
test('the local idle deadline ends presence even while the MCP process remains alive', async t => {
  t.mock.timers.enable({ apis: ['Date','setTimeout','setInterval'], now: 1000 });
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.enter();
  t.mock.timers.tick(119_000); await flush(); assert.equal(f.calls.some(c => c[0] === 'leave'), false);
  f.publish(snapshot(2)); // Background observations must not count as model activity.
  t.mock.timers.tick(1000); await flush(); assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
  assert.throws(() => f.bridge.observe(), /two minutes/);
});
test('shutdown during entry leaves the late admitted session instead of leaking a body', async () => {
  const f = fixture(); let release;
  f.client.enter = () => new Promise(resolve => release = resolve);
  const entry = f.bridge.enter(); const rejected = assert.rejects(entry, /cancelled/); await flush();
  const closing = f.bridge.close(); release(snapshot()); await rejected; await closing;
  assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
  await assert.rejects(f.bridge.enter(), /closing/);
});
test('connection errors end heartbeat and invalidate waiting observations', async t => {
  const f = fixture(); t.after(() => f.bridge.close()); await f.bridge.enter();
  const waiting = f.bridge.observe({ afterRevision: 1, waitMs: 25_000 }); const rejected = assert.rejects(waiting, /connection ended/);
  f.fail(); await rejected; await flush(); assert.equal(f.calls.filter(c => c[0] === 'leave').length, 1);
});
