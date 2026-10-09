import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldBehavior, createBehaviorMemory } from './world-behavior.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import { createDecisionClient } from './decision.mjs';
import { runAgentPresence } from './presence.mjs';
import { taskTool } from './tasks.mjs';
import { AGENT_BUILDING_ENABLED } from './contracts.mjs';

test('parked building is not advertised and rejects forged creative plans even against an older server', async () => {
  assert.equal(AGENT_BUILDING_ENABLED, false);
  assert.deepEqual(taskTool.inputSchema.properties.steps.items.properties.action.enum, [
    'visit',
    'use',
    'approach',
    'express',
    'wait',
  ]);
  let reached = false;
  const f = fixture({
    buildingEnabled: false,
    decision: decisionFixture('edit'),
    policy: {
      async onTurn(_turn, context) {
        reached = true;
        await assert.rejects(context.tools.call('agent_task', { steps: [{ action: 'maze' }] }), {
          code: 'editing_not_granted',
        });
        await assert.rejects(
          context.tools.call('scape_place_object', { emoji: '🌲', x: 1, y: 1, floor: 0 }),
          { code: 'editing_not_granted' },
        );
      },
    },
  });
  f.observe({ scene: { objects: [], editCapabilities: { canPlace: true } } });
  await f.turn([{ type: 'speech', player: f.speech('Scout, build a maze') }]);
  assert.equal(reached, true);
  assert.ok(
    !f.calls.some(call => ['scape_place_object', 'scape_object_catalog'].includes(call.name)),
  );
});
const player = {
  id: 'human',
  name: 'Human',
  x: 3,
  y: 1,
  floor: 0,
  text: '',
  settled: true,
  textRevision: 1,
};
function fixture({
  name = 'Scout',
  memory = createBehaviorMemory(),
  policy = { async onTurn() {} },
  behavior = {},
  buildingEnabled = true,
  decision,
} = {}) {
  let time = 100000,
    state = {
      sessionId: 'one',
      status: 'connected',
      self: { id: 'agent', name, x: 1, y: 1, floor: 0, text: '' },
      players: [{ ...player }],
      roster: [{ ...player, encounterKey: 'stable' }],
      objects: [],
      blocked: [],
      movement: null,
      appearance: { expressions: ['neutral', 'happy', 'curious'] },
    };
  const calls = [];
  let interrupted = 0,
    scheduled = 0;
  const shutdown = new AbortController();
  const context = {
    get observation() {
      return state;
    },
    signal: shutdown.signal,
    tools: {
      async call(name, args) {
        calls.push({ name, args });
        return { ok: true };
      },
    },
    interrupt() {
      interrupted++;
    },
    requestTurn() {
      scheduled++;
    },
    stop() {
      shutdown.abort();
    },
  };
  const config = parseAgentConfig({ name, provider: { type: 'ollama', model: 'test' }, behavior });
  const agent = createWorldBehavior({
    config,
    context,
    policy,
    memory,
    decision,
    buildingEnabled,
    now: () => time,
  });
  return {
    agent,
    context,
    calls,
    memory,
    get interrupted() {
      return interrupted;
    },
    get scheduled() {
      return scheduled;
    },
    advance(ms) {
      time += ms;
    },
    observe(patch = {}, events = []) {
      state = { ...state, ...patch };
      agent.onObservation(state, events, context);
    },
    turn(events = [{ type: 'idle' }]) {
      return agent.onTurn({ observation: state, events }, context);
    },
    speech(text) {
      const p = { ...player, text };
      state = { ...state, players: [p] };
      agent.onObservation(state, [{ type: 'speech', player: p }], context);
      return p;
    },
  };
}

test('BUG-155: a slow speech publication does not consume the five-second reading window', async () => {
  let release,
    publishing = false;
  const sent = new Promise(resolve => {
    release = resolve;
  });
  const f = fixture({
    policy: {
      async onTurn(_, context) {
        await context.tools.call('scape_speak', { text: 'Hello!' });
      },
    },
  });
  const call = f.context.tools.call;
  f.context.tools.call = async (name, args) => {
    if (name === 'scape_speak' && args.text) {
      publishing = true;
      await sent;
    }
    return call(name, args);
  };
  f.observe();
  f.advance(2300);
  const turn = f.turn();
  await new Promise(setImmediate);
  assert.equal(publishing, true);
  f.advance(2000);
  release();
  await turn;
  f.advance(1000);
  f.observe({ self: { ...f.context.observation.self, text: 'Hello!' } });
  f.advance(4999);
  f.agent.tick();
  await new Promise(setImmediate);
  assert.equal(f.calls.filter(c => c.name === 'scape_speak' && c.args.text === '').length, 0);
  f.advance(1);
  f.agent.tick();
  await new Promise(setImmediate);
  assert.equal(f.calls.filter(c => c.name === 'scape_speak' && c.args.text === '').length, 1);
});

test('BUG-155: long replies keep the fifteen-second cap and a queued expiry cannot clear a replacement', async () => {
  const f = fixture();
  f.observe({ self: { ...f.context.observation.self, text: 'A'.repeat(300) } });
  f.advance(14999);
  f.agent.tick();
  await new Promise(setImmediate);
  const clears = () => f.calls.filter(c => c.name === 'scape_speak' && c.args.text === '');
  assert.equal(clears().length, 0);
  f.advance(1);
  f.agent.tick();
  f.observe({ self: { ...f.context.observation.self, text: 'New reply' } });
  await new Promise(setImmediate);
  assert.equal(clears().length, 0);
  f.advance(4999);
  f.agent.tick();
  await new Promise(setImmediate);
  assert.equal(clears().length, 0);
  f.advance(1);
  f.agent.tick();
  await new Promise(setImmediate);
  assert.equal(clears().length, 1);
});

test('processing dots are not a timed reply and quiet still clears speech immediately', async () => {
  const f = fixture();
  f.observe({ self: { ...f.context.observation.self, text: '…' } });
  f.advance(16000);
  f.agent.tick();
  await new Promise(setImmediate);
  assert.equal(f.calls.filter(c => c.name === 'scape_speak').length, 0);
  f.speech('Scout, be quiet');
  await new Promise(setImmediate);
  assert.equal(f.calls.filter(c => c.name === 'scape_stop').length, 1);
});

test('shared behavior defers the next reply until the readable bubble expires', async () => {
  let turns = 0;
  const f = fixture({
    policy: {
      async onTurn() {
        turns++;
      },
    },
  });
  f.observe({ self: { ...f.context.observation.self, text: 'Hello!' } });
  const p = f.speech('Scout, next question');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(turns, 0);
  f.advance(4999);
  f.agent.tick();
  await f.turn();
  assert.equal(turns, 0);
  f.advance(1);
  f.agent.tick();
  await f.turn();
  assert.equal(turns, 1);
});

test('a custom identity gets proactive greetings with in-process cooldowns, not Moss-specific recognition', async () => {
  const turns = [],
    f = fixture({
      name: 'Nova',
      policy: {
        async onTurn(t, c) {
          turns.push(t);
          await c.tools.call('scape_speak', { text: 'Hi' });
        },
      },
    });
  f.observe();
  await f.turn([{ type: 'ready' }]);
  assert.equal(turns.length, 0);
  f.advance(2300);
  f.agent.tick();
  assert.equal(f.scheduled, 1);
  await f.turn();
  assert.equal(turns.length, 1);
  assert.equal(turns[0].events.at(-1).greeting, 'human');
  f.advance(31000);
  f.agent.tick();
  await f.turn();
  assert.equal(turns.length, 1, 'no repeated greeting');
  const again = fixture({
    name: 'Nova',
    memory: f.memory,
    policy: {
      async onTurn() {
        assert.fail('must not greet again');
      },
    },
  });
  again.observe();
  again.advance(2300);
  await again.turn();
  const p = f.speech('Nova, hello');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(turns.length, 2);
});

test('explicit quiet, space and wait requests stop immediately and gate future model actions', async () => {
  let decisions = 0;
  const f = fixture({
    name: 'Nova',
    policy: {
      async onTurn() {
        decisions++;
      },
    },
  });
  f.observe();
  let p = f.speech('Nova, give me space!');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(decisions, 0);
  assert.equal(f.interrupted, 1);
  assert.equal(f.calls[0].name, 'scape_stop');
  const move = f.calls.find(c => c.name === 'scape_move_to');
  assert.ok(move);
  assert.ok(Math.abs(move.args.x - player.x) + Math.abs(move.args.y - player.y) > 2);
  p = f.speech('Nova, tell me a joke');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(decisions, 0);
  p = f.speech('Nova, resume');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(decisions, 1);
  p = f.speech('Nova, wait');
  await f.turn([{ type: 'speech', player: p }]);
  f.advance(60000);
  f.agent.tick();
  await f.turn();
  assert.equal(decisions, 1);
  p = f.speech('Nova, come here');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(decisions, 2);
});

test('quoted quiet instructions from unrelated conversations do not silence an agent', async () => {
  const f = fixture({
    policy: {
      async onTurn(t, c) {
        await c.tools.call('scape_speak', { text: 'reply' });
      },
    },
  });
  f.observe({ players: [player, { ...player, id: 'other', x: 8 }] });
  f.agent.onObservation(f.context.observation, [
    { type: 'speech', player: { ...player, text: 'She said "be quiet"' } },
  ]);
  assert.equal(f.interrupted, 0);
});

test('idle exploration uses public movement without inference or stepping on objects, and respects wait', async () => {
  const f = fixture({
    policy: {
      async onTurn() {
        assert.fail('idle exploration must not require a model');
      },
    },
  });
  f.observe({ players: [], objects: [{ x: 8, y: 8, floor: 0, emoji: '🎹' }] });
  f.advance(31000);
  f.agent.tick();
  await f.turn();
  const move = f.calls.find(c => c.name === 'scape_move_to');
  assert.ok(move);
  assert.equal(Math.abs(move.args.x - 8) + Math.abs(move.args.y - 8), 1);
  assert.ok(f.calls.every(c => c.name !== 'scape_interact'));
  const disabled = fixture({ behavior: { explore: false } });
  disabled.observe({ players: [] });
  disabled.advance(31000);
  await disabled.turn();
  assert.equal(disabled.calls.length, 0);
});

test('local behavior tool handles attention and expression, rejects unknown players and enforces quiet', async () => {
  const f = fixture({
    policy: {
      async onTurn(t, c) {
        await assert.rejects(
          c.tools.call('agent_behavior', { action: 'attend', player: 'hidden' }),
          /visible/,
        );
        await c.tools.call('agent_behavior', { action: 'attend', player: 'human' });
        await c.tools.call('agent_behavior', { action: 'quiet' });
        await assert.rejects(c.tools.call('scape_speak', { text: 'should not speak' }), /Quiet/);
        await assert.rejects(c.tools.call('scape_follow', { player: 'human' }), /pause/);
      },
    },
  });
  f.observe();
  const p = f.speech('Scout, hello');
  await f.turn([{ type: 'speech', player: p }]);
  assert.ok(f.calls.some(c => c.name === 'scape_expression' && c.args.expression === 'curious'));
  assert.ok(
    !f.calls.some(
      c => c.name === 'agent_behavior' || c.name === 'scape_speak' || c.name === 'scape_follow',
    ),
  );
});

for (const action of [
  'attend',
  'quiet',
  'give_space',
  'wait',
  'resume',
  'express',
  'mood',
  'visit',
  'use',
]) {
  test(`behavior tool contract: ${action} has the expected world effect`, async () => {
    const object = { id: 'piano', emoji: '🎹', x: 8, y: 1, floor: 0 };
    let result;
    const f = fixture({
      policy: {
        async onTurn(turn, context) {
          // Let the automatic attention expression settle before an explicit expression.
          f.advance(2000);
          if (action === 'resume') await context.tools.call('agent_behavior', { action: 'wait' });
          result = await context.tools.call('agent_behavior', {
            action,
            ...(['attend', 'quiet', 'give_space', 'resume'].includes(action)
              ? { player: 'human' }
              : {}),
            ...(action === 'express' ? { expression: 'happy' } : {}),
            ...(action === 'mood' ? { mood: 'playful' } : {}),
            ...(['visit', 'use'].includes(action) ? { target: object.id } : {}),
          });
        },
      },
    });
    f.observe({ scene: { floor: 0, blocked: [], objects: [object] } });
    const p = f.speech('Scout, hello');
    await f.turn([{ type: 'speech', player: p }]);
    assert.equal(result.ok, true);
    if (['attend', 'resume'].includes(action)) {
      assert.equal(result.focus, 'human');
      assert.equal(result.waiting, false);
    }
    if (['quiet', 'give_space', 'wait', 'resume'].includes(action)) {
      assert.ok(f.calls.some(call => call.name === 'scape_stop'));
    }
    if (['quiet', 'give_space'].includes(action)) assert.equal(result.quiet, true);
    if (action === 'wait') assert.equal(result.waiting, true);
    if (action === 'give_space') {
      const destination = f.calls.find(call => call.name === 'scape_move_to').args;
      assert.ok(Math.abs(destination.x - player.x) + Math.abs(destination.y - player.y) > 2);
    }
    if (action === 'express') {
      assert.ok(
        f.calls.some(call => call.name === 'scape_expression' && call.args.expression === 'happy'),
      );
    }
    if (action === 'mood') assert.equal(result.mood, 'playful');
    if (['visit', 'use'].includes(action)) {
      const destination = f.calls.find(call => call.name === 'scape_move_to').args;
      assert.equal(Math.abs(destination.x - object.x) + Math.abs(destination.y - object.y), 1);
      assert.equal(f.calls.filter(call => call.name === 'scape_interact').length, 0);
      f.observe({
        self: { id: 'agent', name: 'Scout', ...destination, text: '' },
        movement: { status: 'arrived' },
      });
      await f.turn();
      assert.equal(
        f.calls.filter(call => call.name === 'scape_interact').length,
        action === 'use' ? 1 : 0,
      );
    }
  });
}

for (const action of ['visit', 'use']) {
  test(`BUG-178: wait blocks a ${action} behavior goal until resume`, async () => {
    const object = { id: 'piano', emoji: '🎹', x: 8, y: 1, floor: 0 };
    const f = fixture({
      policy: {
        async onTurn(turn, context) {
          await context.tools.call('agent_behavior', { action: 'wait' });
          await assert.rejects(
            context.tools.call('agent_behavior', { action, target: object.id }),
            error => error.code === 'movement_paused',
          );
          assert.ok(!f.calls.some(call => call.name === 'scape_move_to'));
          await context.tools.call('agent_behavior', { action: 'resume', player: 'human' });
          await context.tools.call('agent_behavior', { action, target: object.id });
        },
      },
    });
    f.observe({ scene: { floor: 0, blocked: [], objects: [object] } });
    const p = f.speech('Scout, hello');
    await f.turn([{ type: 'speech', player: p }]);
    assert.equal(f.calls.filter(call => call.name === 'scape_move_to').length, 1);
  });
}

test('sleep leaves the session, polls without inference, restores appearance and stops on voluntary leave', async () => {
  let time = 0,
    sessions = 0,
    enters = 0,
    polls = 0,
    restored = 0;
  const states = [],
    shutdown = new AbortController();
  const empty = { sessionId: 'one', status: 'connected', self: {}, players: [], roster: [] };
  await runAgentPresence({
    tools: {
      async call(name) {
        if (name === 'scape_world_status') return { potentialParticipants: ++polls > 1 ? 1 : 0 };
        if (name === 'scape_enter') {
          enters++;
          return { entered: true, observation: { ...empty, sessionId: 'two' } };
        }
        throw new Error(name);
      },
    },
    initialObservation: empty,
    signal: shutdown.signal,
    createAgent: () => ({}),
    sleepAfterMs: 30,
    wakeIntervalMs: 5,
    now: () => time,
    wait: async () => {
      time += 5;
    },
    onState: s => states.push(s),
    onEnter: async () => {
      restored++;
    },
    session: async ({ createAgent, initialObservation }) => {
      sessions++;
      let stopped = false;
      const c = {
        stop() {
          stopped = true;
        },
      };
      const p = createAgent(c);
      if (sessions === 1) {
        time = 31;
        p.onObservation(initialObservation, [], c);
        assert.ok(stopped);
      } else c.stop();
    },
  });
  assert.equal(sessions, 2);
  assert.equal(enters, 1);
  assert.equal(polls, 2);
  assert.equal(restored, 1);
  assert.deepEqual(states, ['sleeping', 'connecting', 'listening']);
});

test('sleep does not retry revoked access or session errors', async () => {
  const shutdown = new AbortController();
  let time = 0;
  await assert.rejects(
    runAgentPresence({
      tools: {
        async call() {
          throw new Error('revoked');
        },
      },
      initialObservation: { players: [] },
      signal: shutdown.signal,
      createAgent: () => ({}),
      now: () => time,
      wait: async () => {},
      sleepAfterMs: 1,
      session: async ({ createAgent }) => {
        const c = { stop() {} };
        const p = createAgent(c);
        time = 2;
        p.onObservation({ players: [] }, [], c);
      },
    }),
    /revoked/,
  );
});

test('automatic moods use registered expression aliases and decay without another model request', async () => {
  const f = fixture({
    policy: {
      async onTurn(t, c) {
        await c.tools.call('agent_behavior', { action: 'mood', mood: 'concerned' });
      },
    },
  });
  f.observe({ appearance: { expressions: ['neutral', 'smile', 'nod', 'sympathetic'] } });
  const p = f.speech('Scout, hello');
  await f.turn([{ type: 'speech', player: p }]);
  assert.ok(f.calls.some(c => c.args?.expression === 'nod'));
  f.advance(1600);
  f.agent.tick();
  await f.turn();
  assert.ok(f.calls.some(c => c.args?.expression === 'sympathetic'));
  f.advance(31000);
  f.agent.tick();
  await f.turn();
  assert.ok(f.calls.some(c => c.args?.expression === 'neutral'));
});

test('real session lifecycle leaves before sleeping and re-enters with a fresh policy', async () => {
  let time = 0,
    policies = 0;
  const calls = [],
    shutdown = new AbortController();
  const empty = {
    sessionId: 'one',
    revision: 1,
    status: 'connected',
    self: { id: 'agent', x: 1, y: 1, floor: 0 },
    players: [],
    roster: [],
    objects: [],
    blocked: [],
    movement: null,
  };
  let state = empty;
  const tools = {
    async call(name) {
      calls.push(name);
      if (name === 'scape_observe') {
        time += 10;
        return state;
      }
      if (name === 'scape_world_status') return { potentialParticipants: 1 };
      if (name === 'scape_enter') {
        state = { ...empty, sessionId: 'two', players: [player], roster: [player] };
        return { entered: true, observation: state };
      }
      return { ok: true };
    },
  };
  await runAgentPresence({
    tools,
    initialObservation: empty,
    signal: shutdown.signal,
    sleepAfterMs: 20,
    wakeIntervalMs: 1,
    now: () => time,
    createAgent: context => {
      const ordinal = ++policies;
      return {
        onTurn() {
          if (ordinal === 2) context.stop();
        },
      };
    },
  });
  assert.equal(policies, 2);
  assert.equal(calls.filter(c => c === 'scape_leave').length, 2);
  assert.ok(calls.indexOf('scape_leave') < calls.indexOf('scape_world_status'));
  assert.ok(calls.indexOf('scape_world_status') < calls.indexOf('scape_enter'));
});

function decisionFixture(action, extra = {}) {
  return {
    async evaluate({ questions }) {
      return Object.fromEntries(
        Object.keys(questions).map(key => [
          key,
          {
            type: 'choice',
            choice: key.endsWith('_action')
              ? action
              : key.endsWith('_object')
                ? (extra.object ?? 'none')
                : key === 'mood'
                  ? 'warm'
                  : (extra.activity ?? 'stay'),
          },
        ]),
      );
    },
  };
}
test('decision model can suppress unrelated speech or act before conversation generation', async () => {
  for (const action of ['ignore', 'approach', 'follow', 'reply', 'quiet', 'give_space', 'wait']) {
    let replies = 0;
    const f = fixture({
      decision: decisionFixture(action),
      policy: {
        async onTurn() {
          replies++;
        },
      },
    });
    f.observe();
    const p = f.speech('Would you come stand near me?');
    await f.turn([{ type: 'speech', player: p }]);
    assert.equal(replies, ['reply', 'approach'].includes(action) ? 1 : 0, action);
    if (['approach', 'follow'].includes(action))
      assert.ok(f.calls.some(c => c.name === `scape_${action}` && c.args.player === p.id));
    if (action === 'give_space')
      assert.ok(f.calls.some(c => c.name === 'scape_move_to' && c.args.floor === 0));
  }
});

test('decision target is rechecked after provider latency and cancellation blocks actions', async () => {
  let resolve;
  let replies = 0;
  const client = {
    async evaluate(request) {
      await new Promise(r => {
        resolve = r;
      });
      return decisionFixture('follow').evaluate(request);
    },
  };
  const f = fixture({
    decision: client,
    policy: {
      async onTurn() {
        replies++;
      },
    },
  });
  f.observe();
  const p = f.speech('Follow me please');
  const pending = f.turn([{ type: 'speech', player: p }]);
  await new Promise(r => setImmediate(r));
  f.observe({ players: [], roster: [] });
  resolve();
  await pending;
  assert.equal(replies, 0);
  assert.ok(!f.calls.some(c => c.name === 'scape_follow'));
  const g = fixture({ decision: client });
  g.observe();
  const q = g.speech('Follow me please');
  const cancelled = g.turn([{ type: 'speech', player: q }]);
  await new Promise(r => setImmediate(r));
  g.context.stop();
  resolve();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.ok(!g.calls.some(c => c.name === 'scape_follow'));
});

test('decision interaction uses adjacent objects and creates arrival goals for distant targets', async () => {
  for (const x of [2, 8]) {
    let replies = 0;
    const f = fixture({
      decision: decisionFixture('interact', { object: 'o0' }),
      policy: {
        async onTurn() {
          replies++;
        },
      },
    });
    f.observe({
      scene: { blocked: [], objects: [{ id: 'a'.repeat(64), x, y: 1, floor: 0, emoji: '🎹' }] },
    });
    const p = f.speech('Please play that piano');
    await f.turn([{ type: 'speech', player: p }]);
    assert.equal(replies, 0); // interaction acceptance is not yet a played piano key
    assert.equal(
      f.calls.some(c => c.name === 'scape_interact'),
      x === 2,
    );
    assert.equal(
      f.calls.some(c => c.name === 'scape_move_to'),
      x !== 2,
    );
  }
});

test('decision failure preserves base behavior and explicit controls bypass inference', async () => {
  let evaluated = 0,
    replies = 0;
  const f = fixture({
    decision: {
      async evaluate() {
        evaluated++;
        return null;
      },
    },
    policy: {
      async onTurn() {
        replies++;
      },
    },
  });
  f.observe();
  let p = f.speech('Scout, hello');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(replies, 1);
  assert.equal(evaluated, 1);
  p = f.speech('Scout, be quiet');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(evaluated, 1);
  assert.equal(replies, 1);
});

test('decision activity respects greeting cooldown and exploration settings', async () => {
  let replies = 0;
  const f = fixture({
    decision: decisionFixture('ignore', { activity: 'greet' }),
    policy: {
      async onTurn() {
        replies++;
      },
    },
  });
  f.observe();
  f.advance(2300);
  await f.turn();
  assert.equal(replies, 1);
  await f.turn();
  assert.equal(replies, 1);
  const g = fixture({
    decision: decisionFixture('ignore', { activity: 'explore' }),
    behavior: { explore: false },
  });
  g.observe();
  await g.turn();
  assert.ok(!g.calls.some(c => c.name === 'scape_move_to'));
});

test('thinking remains active from decision inference into conversation and clears on every exit', async () => {
  const states = [];
  let thinking = false;
  const f = fixture({
    decision: decisionFixture('reply'),
    policy: {
      async onTurn() {
        assert.equal(thinking, true);
      },
    },
  });
  f.context.setThinking = async value => {
    thinking = value;
    states.push(value);
  };
  f.observe();
  const p = f.speech('Hello Scout');
  await f.turn([{ type: 'speech', player: p }]);
  assert.deepEqual(states, [true, false]);
  assert.equal(thinking, false);
  const g = fixture({
    decision: {
      async evaluate() {
        throw new Error('failure');
      },
    },
  });
  g.context.setThinking = async value => {
    thinking = value;
  };
  g.observe();
  const q = g.speech('Hello Scout');
  await assert.rejects(g.turn([{ type: 'speech', player: q }]), /failure/);
  assert.equal(thinking, false);
});

test('disabled decision client restores the base path without calling inference or showing decision dots', async () => {
  let turns = 0;
  const f = fixture({
    decision: {
      available: false,
      evaluate() {
        assert.fail('disabled');
      },
    },
    policy: {
      async onTurn() {
        turns++;
      },
    },
  });
  f.context.setThinking = async () => assert.fail('decision must not show dots');
  f.observe();
  const p = f.speech('Hi Scout');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(turns, 1);
});

test('FR-159: world behavior continues during decision cooldown and resumes decisions on fresh speech', async () => {
  let clock = 0,
    requests = 0,
    conversations = 0;
  const client = await createDecisionClient({
    config: { type: 'openrouter' },
    apiKey: 'FIXTURE_KEY',
    now: () => clock,
    fetchImpl: async (_url, options) => {
      if (++requests === 1) return new Response(null, { status: 503 });
      const input = JSON.parse(options.body);
      return Response.json({
        answers: Object.fromEntries(
          Object.entries(input.questions).map(([id, q]) => [
            id,
            {
              type: 'choice',
              choice: id.endsWith('_action') ? 'ignore' : Object.keys(q.criteria)[0],
            },
          ]),
        ),
      });
    },
  });
  const f = fixture({
    decision: client,
    policy: {
      async onTurn() {
        conversations++;
      },
    },
  });
  f.observe();
  for (const text of ['Hi Scout', 'Are you there Scout?']) {
    const p = f.speech(text);
    await f.turn([{ type: 'speech', player: p }]);
  }
  assert.equal(conversations, 2);
  assert.equal(requests, 1);
  clock += 1000;
  const p = f.speech('Never mind Scout');
  await f.turn([{ type: 'speech', player: p }]);
  assert.equal(requests, 2);
  assert.equal(conversations, 2);
  await client.close();
});

test('compound action requests reach the planner even when the decision model selects only the first action', async () => {
  const outcomes = [];
  const f = fixture({
    decision: decisionFixture('interact', { object: 'o0' }),
    policy: {
      async onTurn(turn, context) {
        const outcome = turn.events.find(event => event.type === 'task_result');
        if (outcome) {
          outcomes.push(outcome);
          return;
        }
        await context.tools.call('agent_task', {
          steps: [
            { action: 'use', target: 'piano' },
            { action: 'express', target: 'happy' },
          ],
        });
      },
    },
  });
  f.observe({
    scene: { blocked: [], objects: [{ id: 'piano', x: 2, y: 1, floor: 0, emoji: '🎹' }] },
  });
  await f.turn([{ type: 'speech', player: f.speech('Scout, play the piano then smile') }]);
  assert.ok(!f.calls.some(call => call.name === 'scape_interact'));
  await f.turn();
  assert.equal(f.calls.filter(call => call.name === 'scape_interact').length, 1);
  f.observe({ self: { ...f.context.observation.self, x: 2, y: 1 }, interacting: false });
  await f.turn();
  await f.turn();
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'complete');
  assert.ok(
    f.calls.some(call => call.name === 'scape_expression' && call.args.expression === 'happy'),
  );
});

test('owner cancellation and player stop prevent queued actions from executing', async () => {
  for (const stop of ['owner', 'player']) {
    const f = fixture({
      policy: {
        async onTurn(_, context) {
          await context.tools.call('agent_task', {
            steps: [{ action: 'express', target: 'happy' }],
          });
        },
      },
    });
    await f.turn([{ type: 'speech', player: f.speech('Scout, smile') }]);
    if (stop === 'owner') await f.agent.cancelTask();
    else {
      f.speech('Scout, stop');
      await new Promise(setImmediate);
    }
    await f.turn();
    assert.ok(
      !f.calls.some(call => call.name === 'scape_expression' && call.args.expression === 'happy'),
    );
    assert.ok(f.calls.some(call => call.name === 'scape_stop'));
  }
});

test('notes require explicit requests and the current visitor gets only their own saved context', async () => {
  const saved = [],
    forgotten = [],
    turns = [];
  const memory = createBehaviorMemory({
    notes: {
      async remember(key, text) {
        saved.push({ key, text });
      },
      async forget(key) {
        forgotten.push(key);
      },
      list(key) {
        return saved.filter(note => note.key === key).map(note => note.text);
      },
    },
  });
  const f = fixture({
    memory,
    policy: {
      async onTurn(turn) {
        turns.push(turn);
      },
    },
  });
  await f.turn([{ type: 'speech', player: f.speech('Scout, I like music') }]);
  assert.equal(saved.length, 0);
  await f.turn([{ type: 'speech', player: f.speech('Scout, remember that I like music') }]);
  assert.deepEqual(saved, [{ key: 'stable', text: 'I like music' }]);
  assert.equal(turns.at(-1).events.find(e => e.type === 'memory_result').status, 'saved');
  assert.deepEqual(turns.at(-1).events.at(-1).savedNotes, ['I like music']);
  await f.turn([{ type: 'speech', player: f.speech('Scout, forget my notes') }]);
  assert.deepEqual(forgotten, ['stable']);
});

test('confirmed task outcomes survive a temporary conversation failure without replaying actions', async () => {
  let attempts = 0;
  const f = fixture({
    decision: decisionFixture('interact', { object: 'o0' }),
    policy: {
      async onTurn(turn) {
        assert.equal(turn.events.find(event => event.type === 'task_result').status, 'complete');
        if (++attempts === 1)
          throw Object.assign(new Error('Temporary failure'), { code: 'provider_unavailable' });
      },
    },
  });
  f.observe({
    scene: { blocked: [], objects: [{ id: 'a'.repeat(64), x: 2, y: 1, floor: 0, emoji: '🎹' }] },
  });
  await f.turn([{ type: 'speech', player: f.speech('Scout, play the piano') }]);
  f.observe({ self: { ...f.context.observation.self, x: 2, y: 1 }, interacting: false });
  await assert.rejects(f.turn(), { code: 'provider_unavailable' });
  await f.turn();
  assert.equal(attempts, 2);
  assert.equal(f.calls.filter(call => call.name === 'scape_interact').length, 1);
});

test('BUG-179: perceived conversation is marked read-only while expression requests retain actions', async () => {
  for (const action of ['reply', 'express']) {
    let social;
    const f = fixture({
      decision: decisionFixture(action),
      policy: {
        async onTurn(turn) {
          social = turn.events.find(event => event.type === 'social');
        },
      },
    });
    f.observe();
    const p = f.speech(action === 'reply' ? 'Scout, what are you doing?' : 'Scout, look happy');
    await f.turn([{ type: 'speech', player: p }]);
    assert.equal(social.conversationOnly, action === 'reply');
  }
});

test('approved compound editing requests reach editing tools without becoming movement tasks', async () => {
  let social;
  const f = fixture({
    decision: decisionFixture('edit'),
    policy: {
      async onTurn(turn, context) {
        social = turn.events.find(event => event.type === 'social');
        await context.tools.call('scape_place_object', {
          emoji: '🌲',
          x: 4,
          y: 4,
          floor: 0,
          sceneRevision: 0,
        });
      },
    },
  });
  f.observe({ scene: { objects: [], editCapabilities: { enabled: true, canPlace: true } } });
  await f.turn([{ type: 'speech', player: f.speech('Scout, place a tree and a flower') }]);
  assert.equal(social.conversationOnly, false);
  assert.equal(social.taskPlanning, false);
  assert.equal(f.calls.filter(call => call.name === 'scape_place_object').length, 1);
});

test('FR-181: shared behavior executes a large building request without returning to the model per tile', async () => {
  let modelCalls = 0,
    placed = 0,
    result;
  const f = fixture({
    decision: decisionFixture('edit'),
    policy: {
      async onTurn(turn, context) {
        modelCalls++;
        const outcome = turn.events.find(e => e.type === 'task_result');
        if (outcome) {
          result = outcome;
          assert.ok(
            !turn.events
              .find(e => e.type === 'social')
              .recentActions.some(e => e.tool === 'scape_observe'),
          );
          return;
        }
        await context.tools.call('agent_task', {
          steps: [
            {
              action: 'build',
              x: 0,
              y: 10,
              floor: 0,
              rows: Array(15).fill('#'.repeat(20)),
              palette: [{ symbol: '#', emoji: '🧱' }],
            },
          ],
        });
      },
    },
  });
  f.observe({
    scene: {
      sceneRevision: 0,
      blocked: [],
      objects: [],
      editCapabilities: { canPlace: true, maxEditsPerMinute: 120 },
    },
  });
  const call = f.context.tools.call;
  f.context.tools.call = async (name, args) => {
    if (name === 'scape_observe') return structuredClone(f.context.observation);
    if (name === 'scape_place_object') {
      assert.equal(args.sceneRevision, f.context.observation.scene.sceneRevision);
      return {
        ok: true,
        operationId: String(++placed),
        sceneRevision: ++f.context.observation.scene.sceneRevision,
      };
    }
    return call(name, args);
  };
  await f.turn([{ type: 'speech', player: f.speech('Scout, build a large structure') }]);
  assert.equal(modelCalls, 1);
  for (let i = 0; i < 300; i++) {
    await f.turn();
    f.advance(700);
  }
  assert.equal(placed, 300);
  assert.equal(result.status, 'complete');
  assert.equal(result.completed, 300);
  assert.equal(modelCalls, 2);
});
