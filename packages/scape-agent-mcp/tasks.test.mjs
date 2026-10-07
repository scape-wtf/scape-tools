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
  assert.throws(() => f.queue.start(Array(9).fill({ action: 'use', target: 'piano' }), 'p'));
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
