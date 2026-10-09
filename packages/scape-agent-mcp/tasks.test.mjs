import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskQueue } from './tasks.mjs';
import { createObjectGoals } from './world-goals.mjs';

function fixture() {
  let now = 0;
  const calls = [],
    events = [];
  const context = {
    signal: new AbortController().signal,
    requestTurn() {},
    observation: {
      self: { x: 1, y: 1, floor: 0 },
      players: [{ id: 'p', x: 1, y: 5, floor: 0 }],
      blocked: [],
      objects: [],
      scene: {
        floor: 0,
        blocked: [],
        objects: [{ id: 'piano', emoji: '🎹', x: 4, y: 1, floor: 0 }],
      },
      appearance: { expressions: ['happy'] },
    },
  };
  const tools = {
    async call(tool, args) {
      calls.push({ tool, args });
      return { ok: true, operationId: 'move' };
    },
  };
  const call = (tool, args, tools) => tools.call(tool, args);
  const goals = createObjectGoals({ context, now: () => now, call, canStand: () => true });
  const queue = createTaskQueue({
    context,
    goals,
    call,
    now: () => now,
    onChange: tasks => events.push(tasks),
  });
  return {
    context,
    tools,
    calls,
    events,
    queue,
    goals,
    advance: ms => {
      now += ms;
    },
    arrive() {
      context.observation.self = {
        ...context.observation.self,
        ...calls.find(c => c.tool === 'scape_move_to').args,
      };
      context.observation.movement = { id: 'move', status: 'arrived' };
    },
  };
}
test('ordered tasks wait for confirmed arrival and interaction before expression; results preserve each step', async () => {
  const f = fixture();
  f.queue.start(
    [
      { action: 'use', target: 'piano' },
      { action: 'express', target: 'happy' },
    ],
    'p',
  );
  await f.queue.advance(f.tools);
  assert.deepEqual(
    f.calls.map(c => c.tool),
    ['scape_move_to'],
  );
  await f.queue.advance(f.tools);
  assert.equal(f.calls.length, 1);
  f.arrive();
  await f.queue.advance(f.tools);
  assert.deepEqual(
    f.calls.map(c => c.tool),
    ['scape_move_to', 'scape_interact'],
  );
  assert.equal(await f.queue.advance(f.tools), undefined);
  f.context.observation.self = { x: 4, y: 1, floor: 0 };
  f.context.observation.interacting = false;
  await f.queue.advance(f.tools);
  const result = await f.queue.advance(f.tools);
  assert.equal(result.status, 'complete');
  assert.ok(result.steps.every(step => step.status === 'complete'));
  assert.equal(f.calls.at(-1).tool, 'scape_expression');
});
test('failure cancels remaining steps and reports partial completion', async () => {
  const f = fixture();
  f.queue.start(
    [
      { action: 'express', target: 'happy' },
      { action: 'use', target: 'piano' },
      { action: 'express', target: 'happy' },
    ],
    'p',
  );
  await f.queue.advance(f.tools);
  f.advance(1100);
  await f.queue.advance(f.tools);
  f.context.observation.scene.objects = [];
  const result = await f.queue.advance(f.tools);
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.steps.map(step => step.status),
    ['complete', 'failed', 'cancelled'],
  );
  assert.equal(f.calls.filter(c => c.tool === 'scape_expression').length, 1);
});
test('cancel while a tool is pending prevents the remaining plan from running', async () => {
  const f = fixture();
  let resolve;
  const held = new Promise(done => {
    resolve = done;
  });
  f.queue.start(
    [
      { action: 'express', target: 'happy' },
      { action: 'use', target: 'piano' },
    ],
    'p',
  );
  const operation = f.queue.advance({ call: () => held });
  f.queue.cancel();
  resolve({ ok: true });
  await operation;
  await f.queue.advance(f.tools);
  assert.equal(f.queue.busy, false);
  assert.equal(f.calls.length, 0);
});
test('unknown targets, oversized plans and overlapping plans are rejected before side effects', () => {
  const f = fixture();
  assert.throws(() => f.queue.start([{ action: 'use', target: 'unknown' }], 'p'));
  assert.throws(() => f.queue.start(Array(513).fill({ action: 'use', target: 'piano' }), 'p'));
  f.queue.start([{ action: 'visit', target: 'piano' }], 'p');
  assert.throws(() => f.queue.start([{ action: 'visit', target: 'piano' }], 'p'), {
    code: 'task_pending',
  });
  assert.equal(f.calls.length, 0);
});
test('superseded movement is failure, not false task completion', async () => {
  const f = fixture();
  f.queue.start([{ action: 'use', target: 'piano' }], 'p');
  await f.queue.advance(f.tools);
  f.context.observation.movement = { id: 'other', status: 'arrived' };
  assert.equal((await f.queue.advance(f.tools)).status, 'failed');
  assert.ok(!f.calls.some(c => c.tool === 'scape_interact'));
});

test('BUG-179: task outcomes preserve the original request separately from the executed steps', async () => {
  const f = fixture();
  f.context.observation.players[0].text = 'Play the piano then come back and smile.';
  f.queue.start([{ action: 'express', target: 'happy' }], 'p');
  f.context.observation.players[0].text = 'A later bubble is not the task request.';
  const result = await f.queue.advance(f.tools);
  assert.equal(result.request, 'Play the piano then come back and smile.');
  assert.deepEqual(
    result.steps.map(step => step.action),
    ['express'],
  );
});

function buildingFixture() {
  const f = fixture();
  f.context.observation.scene.editCapabilities = { canPlace: true, maxEditsPerMinute: 120 };
  f.context.observation.scene.sceneRevision = 0;
  const placed = [];
  const tools = {
    async call(name, args) {
      if (name === 'scape_observe') return structuredClone(f.context.observation);
      assert.equal(name, 'scape_place_object');
      assert.equal(args.sceneRevision, f.context.observation.scene.sceneRevision);
      placed.push(args);
      return {
        ok: true,
        operationId: String(placed.length),
        sceneRevision: ++f.context.observation.scene.sceneRevision,
      };
    },
  };
  const layout = {
    action: 'build',
    x: 0,
    y: 2,
    floor: 0,
    rows: Array(20).fill('#'.repeat(20)),
    palette: [{ symbol: '#', emoji: '🧱' }],
  };
  return { ...f, tools, placed, layout };
}
test('FR-181: one accepted layout completes 400 paced edits without further model calls', async () => {
  const f = buildingFixture();
  f.queue.start([f.layout], 'p');
  let result;
  for (let i = 0; i < 400; i++) {
    result = await f.queue.advance(f.tools);
    if (i < 399) {
      assert.equal(f.queue.due(), false);
      await f.queue.advance(f.tools);
      assert.equal(f.placed.length, i + 1);
      assert.equal(f.queue.progress.completed, i + 1);
    }
    f.advance(700);
  }
  assert.equal(result.status, 'complete');
  assert.equal(result.completed, 400);
  assert.equal(result.total, 400);
  assert.ok(JSON.stringify(result).length < 10000);
  assert.equal(f.placed.length, 400);
  assert.equal(new Set(f.placed.map(p => `${p.x},${p.y}`)).size, 400);
});
test('FR-181: throttle and stale revisions wait and retry safely; permissions stop remaining work', async () => {
  const f = buildingFixture();
  f.queue.start([f.layout], 'p');
  for (const code of ['rate_limited', 'stale_scene']) {
    await f.queue.advance({
      call: (name, args) =>
        name === 'scape_place_object'
          ? Promise.reject(Object.assign(new Error(), { code }))
          : f.tools.call(name, args),
    });
    assert.equal(f.placed.length, 0);
    assert.equal(f.queue.due(), false);
    f.advance(60000);
  }
  await f.queue.advance(f.tools);
  f.advance(700);
  f.context.observation.scene.editCapabilities.canPlace = false;
  const result = await f.queue.advance(f.tools);
  assert.equal(result.status, 'failed');
  assert.equal(result.completed, 1);
  assert.equal(f.placed.length, 1);
});
test('FR-181: cancellation during refresh prevents placement; departure and rests bound execution', async () => {
  const f = buildingFixture();
  f.queue.start([f.layout], 'p');
  let resolve;
  const pending = f.queue.advance({
    call: () =>
      new Promise(done => {
        resolve = done;
      }),
  });
  f.queue.cancel();
  resolve(f.context.observation);
  await pending;
  assert.equal(f.placed.length, 0);
  f.queue.start(
    [
      { action: 'wait', milliseconds: 500 },
      { action: 'express', target: 'happy' },
    ],
    'p',
  );
  await f.queue.advance(f.tools);
  assert.equal(f.queue.progress.completed, 0);
  f.advance(500);
  await f.queue.advance(f.tools);
  assert.equal(f.queue.progress.completed, 1);
  f.context.observation.players = [];
  assert.equal((await f.queue.advance(f.tools)).status, 'cancelled');
});

test('FR-181: repeated expressions respect cooldowns and throttled physical steps continue', async () => {
  const f = fixture();
  f.queue.start([{ action: 'express', target: 'happy', repeat: 3 }], 'p');
  await f.queue.advance(f.tools);
  assert.equal(f.queue.due(), false);
  await f.queue.advance(f.tools);
  assert.equal(f.calls.length, 1);
  f.advance(1100);
  await f.queue.advance({
    call: async () => {
      throw Object.assign(new Error(), { code: 'rate_limited' });
    },
  });
  f.advance(60000);
  await f.queue.advance(f.tools);
  f.advance(1100);
  assert.equal((await f.queue.advance(f.tools)).status, 'complete');
  assert.equal(f.calls.length, 3);
});

test('FR-181: cancelling a pending piano interaction never revives the goal or the score', async () => {
  const f = fixture();
  f.context.observation.self = { x: 3, y: 1, floor: 0 };
  f.queue.start([{ action: 'use', target: 'piano', repeat: 2 }], 'p');
  let resolve;
  const pending = f.queue.advance({
    call: () =>
      new Promise(done => {
        resolve = done;
      }),
  });
  f.queue.cancel();
  resolve({ ok: true });
  await pending;
  assert.equal(f.queue.busy, false);
  assert.equal(f.queue.due(), false);
  assert.equal(f.goals.current, undefined);
});

test('FR-181: a conveyor piano keeps its traversal behavior and does not wait on the departed key', async () => {
  const f = fixture();
  f.context.observation.self = { x: 3, y: 1, floor: 0 };
  f.context.observation.scene.objects[0].conveyorEmoji = '➡️';
  f.queue.start([{ action: 'use', target: 'piano' }], 'p');
  assert.equal(await f.queue.advance(f.tools), undefined);
  f.context.observation.interacting = true;
  f.context.observation.self = { x: 5, y: 1, floor: 0 };
  assert.equal(await f.queue.advance(f.tools), undefined);
  f.context.observation.interacting = false;
  f.context.observation.self = { x: 7, y: 1, floor: 0 };
  const result = await f.queue.advance(f.tools);
  assert.equal(result.status, 'complete');
  assert.equal(f.goals.current, undefined);
});

test('FR-181: repeated conveyor-piano use waits for each ride before requesting the next interaction', async () => {
  const f = fixture();
  f.context.observation.self = { x: 3, y: 1, floor: 0 };
  f.context.observation.scene.objects[0].conveyorEmoji = '➡️';
  f.queue.start([{ action: 'use', target: 'piano', repeat: 2 }], 'p');
  await f.queue.advance(f.tools);
  await f.queue.advance(f.tools); // the accepted first entry has not arrived yet
  assert.equal(f.calls.filter(c => c.tool === 'scape_interact').length, 1);
  f.context.observation.interacting = true;
  f.context.observation.self = { x: 5, y: 1, floor: 0 };
  await f.queue.advance(f.tools);
  assert.equal(f.calls.filter(c => c.tool === 'scape_interact').length, 1);
  f.context.observation.interacting = false;
  await f.queue.advance(f.tools);
  await f.queue.advance(f.tools);
  assert.equal(f.calls.filter(c => c.tool === 'scape_interact').length, 2);
  f.context.observation.interacting = true;
  f.context.observation.self = { x: 6, y: 1, floor: 0 };
  await f.queue.advance(f.tools);
  f.context.observation.interacting = false;
  assert.equal((await f.queue.advance(f.tools)).status, 'complete');
});

test('FR-181: a rejected conveyor-piano entry cannot become a completed score step', async () => {
  const f = fixture();
  f.context.observation.self = { x: 3, y: 1, floor: 0 };
  f.context.observation.scene.objects[0].conveyorEmoji = '➡️';
  f.queue.start([{ action: 'use', target: 'piano' }], 'p');
  await f.queue.advance(f.tools);
  f.context.observation.interacting = true;
  await f.queue.advance(f.tools);
  f.context.observation.interacting = false;
  assert.equal(await f.queue.advance(f.tools), undefined);
  assert.equal(f.queue.progress.completed, 0);
  f.advance(45001);
  assert.equal((await f.queue.advance(f.tools)).status, 'failed');
});
