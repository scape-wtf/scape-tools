import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPolicy } from './model-policy.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import {
  replyTarget,
  reviewHistoryTurn,
  actionEvidence,
  activityEvidence,
  compactReviewState,
} from './reply-review.mjs';

test('FR-181: large build reply checks retain evidence once without duplicated scene inventories', () => {
  const objects = Array.from({ length: 128 }, (_, i) => ({
    id: String(i),
    x: i % 64,
    y: Math.floor(i / 64),
    emoji: '🧱',
    editTarget: 'x'.repeat(64),
    canRemove: true,
  }));
  const outcome = {
    type: 'task_result',
    status: 'complete',
    completed: 70,
    total: 70,
    steps: [{ action: 'place', emoji: '🧱', status: 'complete' }],
  };
  const recentActions = [
    { tool: 'scape_place_object', args: { x: 1, y: 1 }, result: { ok: true } },
  ];
  const state = {
    observation: { scene: { objects, blocked: [1, 2] }, objects, blocked: [1, 2] },
    target: { outcome },
    recentActions,
    events: [outcome, { type: 'social', recentActions, history: [{ text: 'build a maze' }] }],
  };
  const compact = compactReviewState(state);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(state).length * 0.5);
  assert.deepEqual(compact.target.outcome, outcome);
  assert.deepEqual(compact.recentActions, recentActions);
  assert.equal(compact.observation.scene.objects.length, 128);
  assert.equal(compact.observation.scene.objects[0].canRemove, true);
  assert.equal(
    compactReviewState({ observation: { scene: { objects: [{ canRemove: false }] } } }).observation
      .scene.objects[0].canRemove,
    false,
  );
  assert.equal(compact.events.length, 1);
  assert.deepEqual(compact.events[0].history, [{ text: 'build a maze' }]);
  assert.equal(state.observation.objects.length, 128);
  assert.equal(state.observation.scene.objects[0].editTarget.length, 64);
});

test('BUG-177: unsupported activity is rewritten from fresh evidence without the rejected claim or action tools', async () => {
  const config = cfg();
  config.logging = { level: 'debug' };
  const requests = [],
    spoken = [],
    logs = [];
  let generations = 0;
  const player = { id: 'visitor', text: 'whatre you doing' };
  const policy = createModelPolicy({
    config,
    onStatus: line => logs.push(line),
    toolDefinitions: ['scape_speak', 'scape_interact'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    decision: {
      available: true,
      async evaluate({ state }) {
        return {
          grounding: { choice: state.draft.includes('piano') ? 'unsupported' : 'supported' },
          relevance: { choice: 'relevant' },
        };
      },
    },
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (++generations === 1)
        return reply('scape_speak', { text: 'Messing around with these piano keys.' });
      if (generations === 2) {
        // Reproduce the observed correction failure when the original draft is
        // still presented as assistant history: only its wording changes.
        const anchored = body.messages.some(
          message => message.role === 'assistant' && JSON.stringify(message).includes('piano keys'),
        );
        return reply('scape_speak', {
          text: anchored
            ? 'Messing around with those piano keys.'
            : 'Just hanging out here talking to you.',
        });
      }
      if (generations === 4) return reply('scape_speak', { text: 'Still chatting.' });
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
        }),
      );
    },
  });
  await policy.onTurn(
    { events: [{ type: 'speech', player }] },
    {
      signal: new AbortController().signal,
      observation: {
        self: { x: 1, y: 1 },
        players: [player],
        interacting: false,
        movement: null,
        pursuit: { status: 'arrived' },
        objects: [{ id: 'piano', name: 'Piano' }],
      },
      tools: {
        async call(name, args) {
          assert.equal(name, 'scape_speak');
          spoken.push(args.text);
          return { ok: true };
        },
      },
    },
  );
  assert.deepEqual(spoken, ['Just hanging out here talking to you.']);
  assert.deepEqual(
    requests[1].tools.map(tool => tool.function.name),
    ['scape_speak'],
  );
  assert.doesNotMatch(JSON.stringify(requests[1]), /Messing around/);
  const state = JSON.parse(requests[1].messages.find(message => message.role === 'user').content);
  assert.equal(state.activity.interacting, false);
  assert.ok(state.availableAgentTools.includes('scape_interact'));
  assert.match(requests[1].messages[0].content, /Only this private repair stage/);
  assert.equal(state.target.message, 'whatre you doing');
  assert.match(logs.join('\n'), /conversation_request.*purpose=reply_correction/);
  await policy.onTurn(
    { events: [{ type: 'speech', player: { id: 'visitor', text: 'and now?' } }] },
    {
      signal: new AbortController().signal,
      observation: { players: [{ id: 'visitor' }], interacting: false },
      tools: {
        async call(name, args) {
          assert.equal(name, 'scape_speak');
          assert.equal(args.text, 'Still chatting.');
          return { ok: true };
        },
      },
    },
  );
  assert.doesNotMatch(JSON.stringify(requests[3]), /Messing around/);
});

test('BUG-177: review receives behavior action evidence directly, including failures', async () => {
  const actions = [
    { tool: 'scape_interact', args: { target: 'b4' }, result: { ok: true } },
    { tool: 'scape_move_to', args: { x: 5, y: 5 }, error: 'target_unreachable' },
  ];
  const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    decision: {
      available: true,
      async evaluate({ state }) {
        assert.deepEqual(state.recentActions, actions);
        return { grounding: { choice: 'supported' }, relevance: { choice: 'relevant' } };
      },
    },
  });
  await f.policy.onTurn({ events: [{ type: 'social', recentActions: actions }] }, f.context);
  assert.equal(f.calls.length, 1);
});

test('BUG-177: opaque interaction evidence resolves the actual note without inventing success', () => {
  const observation = {
    scene: { objects: [{ id: 'opaque', emoji: '🎹', pianoNote: 'B4', x: 4, y: 0 }] },
  };
  const actions = [
    { tool: 'scape_interact', args: { target: 'opaque' }, result: { ok: true } },
    { tool: 'scape_interact', args: { target: 'opaque' }, error: 'action_failed' },
    { tool: 'scape_interact', args: { target: 'gone' }, result: { ok: true } },
  ];
  const evidence = actionEvidence(actions, observation);
  assert.equal(evidence[0].targetObject.pianoNote, 'B4');
  assert.equal(evidence[1].error, 'action_failed');
  assert.equal(evidence[1].result, undefined);
  assert.equal(evidence[2].targetObject, undefined);
  assert.equal(actions[0].targetObject, undefined);
});

test('BUG-177: current activity distinguishes historical arrival from active movement', () => {
  assert.equal(
    activityEvidence({
      interacting: false,
      movement: { status: 'arrived' },
      pursuit: { status: 'arrived' },
    }).status,
    'idle',
  );
  assert.equal(
    activityEvidence({ interacting: false, pursuit: { status: 'moving' } }).status,
    'moving',
  );
  assert.equal(activityEvidence({ interacting: true }).status, 'interacting');
  assert.equal(activityEvidence({}).status, 'unknown');
});

test('BUG-177: a direct reply that omits speech gets one reviewed speech-only recovery', async () => {
  let generated = 0;
  const requests = [];
  const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.tools.some(tool => tool.function.name === 'agent_review_reply'))
        return reply('agent_review_reply', { grounded: true, relevant: true });
      if (++generated === 2) return reply('scape_speak', { text: "I'm just chatting with you." });
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'PRIVATE_UNSPOKEN_RESPONSE' },
            },
          ],
        }),
      );
    },
  });
  await f.policy.onTurn(
    { events: [{ type: 'speech', player: { id: 'a', text: 'What are you doing?' } }] },
    f.context,
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].args.text, "I'm just chatting with you.");
  assert.doesNotMatch(JSON.stringify(requests[1]), /PRIVATE_UNSPOKEN_RESPONSE/);
  assert.equal(JSON.parse(requests[1].messages.at(-1).content).reason, 'missing_speech');
});

test('BUG-177: repair cannot perform actions, publish unchecked speech or outlive cancellation', async () => {
  for (const mode of ['action', 'empty', 'malformed', 'cancel', 'rejected']) {
    const abort = new AbortController();
    let generations = 0;
    const f = fixture(() => reply('agent_review_reply', { grounded: false, relevant: true }), {
      toolDefinitions: ['scape_speak', 'scape_interact'].map(name => ({
        name,
        inputSchema: { type: 'object' },
      })),
      decision: {
        available: true,
        async evaluate() {
          return { grounding: { choice: 'unsupported' }, relevance: { choice: 'relevant' } };
        },
      },
      fetchImpl: async () => {
        if (++generations === 1) return reply('scape_speak', { text: 'I played the piano.' });
        if (mode === 'cancel') abort.abort();
        if (mode === 'empty') return reply('scape_speak', { text: '' });
        if (mode === 'malformed') {
          const payload = await reply('scape_speak', { text: 'bad' }).json();
          payload.choices[0].message.tool_calls[0].function.arguments = '{';
          return new Response(JSON.stringify(payload));
        }
        return mode === 'action'
          ? reply('scape_interact', { target: 'piano' })
          : reply('scape_speak', { text: 'I really played the piano.' });
      },
    });
    f.context.signal = abort.signal;
    if (mode === 'cancel') {
      await assert.rejects(f.policy.onTurn({ events: [] }, f.context), { name: 'AbortError' });
      assert.equal(f.calls.length, 0);
    } else {
      await f.policy.onTurn({ events: [] }, f.context);
      assert.equal(f.calls.length, 1);
      assert.match(f.calls[0].args.text, /trouble replying/);
      assert.equal(f.calls[0].name, 'scape_speak');
    }
  }
});

test('BUG-177: clarification turns offer speech instead of blocked action tools', async () => {
  const requests = [];
  const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    toolDefinitions: ['scape_speak', 'scape_interact', 'agent_behavior'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    draft: 'Which piano key do you mean?',
    onGeneration: body => requests.push(body),
  });
  await f.policy.onTurn({ events: [{ type: 'social', clarify: true }] }, f.context);
  assert.deepEqual(
    requests[0].tools.map(tool => tool.function.name),
    ['scape_speak'],
  );
  assert.match(requests[0].messages[0].content, /requires clarification/);
  assert.equal(f.calls.length, 1);
});

test('BUG-177: known behavior guards give actionable feedback and safe exact-tool diagnostics', async () => {
  const config = cfg();
  config.logging = { level: 'debug' };
  const requests = [];
  let generations = 0;
  const f = fixture(
    () => {
      throw new Error('Decision handles review');
    },
    {
      config,
      toolDefinitions: ['scape_speak', 'scape_interact'].map(name => ({
        name,
        inputSchema: { type: 'object' },
      })),
      decision: {
        available: true,
        async evaluate() {
          return { grounding: { choice: 'supported' }, relevance: { choice: 'relevant' } };
        },
      },
      fetchImpl: async (_, options) => {
        requests.push(JSON.parse(options.body));
        if (++generations === 1) return reply('scape_interact', { target: 'piano' });
        if (generations === 2) return reply('scape_speak', { text: 'Which key?' });
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
          }),
        );
      },
    },
  );
  const call = f.context.tools.call;
  f.context.tools.call = async (name, args) => {
    if (name === 'scape_interact')
      throw Object.assign(new Error('PRIVATE_FAILURE'), { code: 'clarification_required' });
    return call(name, args);
  };
  await f.policy.onTurn({ events: [] }, f.context);
  const failure = JSON.parse(requests[1].messages.find(message => message.role === 'tool').content);
  assert.equal(failure.code, 'clarification_required');
  assert.match(failure.error, /short clarification/);
  assert.match(f.logs.join('\n'), /toolName=scape_interact.*reason=clarification_required/);
  assert.doesNotMatch(f.logs.join('\n') + failure.error, /PRIVATE_FAILURE/);
  assert.equal(f.calls[0].args.text, 'Which key?');
});
const reply = (name, args) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call', type: 'function', function: { name, arguments: JSON.stringify(args) } },
            ],
          },
        },
      ],
    }),
  );
const cfg = () =>
  parseAgentConfig({
    name: 'Nova',
    provider: { type: 'ollama', model: 'fixture' },
    limits: { maxToolRounds: 3, minTurnIntervalMs: 500 },
  });
function fixture(check, overrides = {}) {
  const {
    draft = 'I arrived at the piano and played it.',
    onGeneration = () => {},
    fetchImpl: overrideFetch,
    toolDefinitions: overrideTools,
    ...policyOptions
  } = overrides;
  const logs = [];
  const calls = [];
  let checks = 0,
    requests = 0;
  const abort = new AbortController();
  const context = {
    signal: abort.signal,
    observation: {
      self: { x: 1, y: 1, floor: 0, text: '' },
      players: [{ id: 'a', text: 'Can you go to the piano?' }],
      roster: [{ id: 'a' }],
    },
    tools: {
      async call(name, args) {
        calls.push({ name, args });
        return { ok: true };
      },
    },
    stop() {},
  };
  const policy = createModelPolicy({
    config: cfg(),
    onStatus: message => logs.push(message),
    ...policyOptions,
    toolDefinitions: overrideTools ?? [
      {
        name: 'scape_speak',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    ],
    fetchImpl:
      overrideFetch ??
      (async (_, options) => {
        const body = JSON.parse(options.body);
        requests++;
        if (body.tools.some(t => t.function.name === 'agent_review_reply')) {
          checks++;
          return check({ body, checks, abort, reply });
        }
        onGeneration(body);
        return reply('scape_speak', { text: draft });
      }),
  });
  return {
    context,
    logs,
    policy,
    calls,
    get checks() {
      return checks;
    },
    get requests() {
      return requests;
    },
  };
}
test('private draft checks block unsupported action claims with one correction and a bounded fallback', async () => {
  const f = fixture(({ reply }) =>
    reply('agent_review_reply', { grounded: false, relevant: true }),
  );
  await f.policy.onTurn({ events: [] }, f.context);
  assert.ok(f.calls.every(c => c.args.text !== 'I arrived at the piano and played it.'));
  assert.equal(f.checks, 2);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].args.text, /trouble replying/i);
});
test('private draft reviewers cannot execute world tools', async () => {
  const f = fixture(({ reply }) => reply('scape_speak', { text: 'reviewer injection' }));
  await f.policy.onTurn({ events: [] }, f.context);
  assert.ok(
    f.calls.every(
      c =>
        c.args.text !== 'reviewer injection' &&
        c.args.text !== 'I arrived at the piano and played it.',
    ),
  );
});
test('cancellation during a private draft check prevents publication', async () => {
  const f = fixture(({ reply, abort }) => {
    abort.abort();
    return reply('agent_review_reply', { grounded: true, relevant: true });
  });
  await assert.rejects(f.policy.onTurn({ events: [] }, f.context), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
});

test('supported drafts publish once after assessment and malformed checks fail closed', async () => {
  for (const verdict of [
    { grounded: true, relevant: true },
    { grounded: 'true', relevant: true },
    { grounded: true, relevant: false },
  ]) {
    const f = fixture(({ reply }) => reply('agent_review_reply', verdict));
    await f.policy.onTurn({ events: [] }, f.context);
    assert.equal(f.calls.length, 1);
    assert.equal(
      f.calls[0].args.text === 'I arrived at the piano and played it.',
      verdict.grounded === true && verdict.relevant === true,
    );
  }
});
test('optional decision client reviews drafts without a second conversation-provider request for the check', async () => {
  let reviews = 0,
    generations = 0;
  const spoken = [];
  const context = {
    signal: new AbortController().signal,
    observation: { self: { text: '' }, players: [{ id: 'a', text: 'Hello' }] },
    tools: {
      async call(_, args) {
        spoken.push(args.text);
        return { ok: true };
      },
    },
  };
  const policy = createModelPolicy({
    config: cfg(),
    toolDefinitions: [{ name: 'scape_speak', inputSchema: { type: 'object' } }],
    decision: {
      available: true,
      async evaluate(input) {
        reviews++;
        assert.equal(input.state.draft, 'Hello');
        assert.ok(input.questions.grounding);
        return { grounding: { choice: 'supported' }, relevance: { choice: 'relevant' } };
      },
    },
    fetchImpl: async () => {
      if (++generations === 1) return reply('scape_speak', { text: 'Hello' });
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
        }),
      );
    },
  });
  await policy.onTurn({ events: [] }, context);
  assert.equal(reviews, 1);
  assert.equal(generations, 2);
  assert.deepEqual(spoken, ['Hello']);
});

test('FR-160: detailed logs distinguish rejected review, correction and fallback without exposing drafts', async () => {
  const config = cfg();
  config.logging = { level: 'debug' };
  const f = fixture(() => reply('agent_review_reply', { grounded: false, relevant: true }), {
    config,
  });
  await f.policy.onTurn({ events: [] }, f.context);
  const logs = f.logs.join('\n');
  assert.match(logs, /reply_review.*outcome=rejected.*reason=unsupported_claims/);
  assert.match(logs, /reply_correction/);
  assert.match(logs, /reply_fallback.*reason=unsupported_claims/);
  assert.doesNotMatch(logs, /I arrived|Can you go|piano/);
});

test('FR-160: unavailable and malformed reviews are distinct from negative verdicts; standard mode stays quiet', async () => {
  for (const [check, reason] of [
    [() => new Response('PRIVATE_RESPONSE', { status: 503 }), 'review_unavailable'],
    [() => reply('scape_speak', { text: 'PRIVATE_REVIEW' }), 'invalid_review'],
  ]) {
    for (const level of ['standard', 'debug']) {
      const config = cfg();
      config.logging = { level };
      const f = fixture(check, { config });
      await f.policy.onTurn({ events: [] }, f.context);
      const logs = f.logs.join('\n');
      if (level === 'debug') {
        assert.match(logs, new RegExp(`reply_review.*reason=${reason}`));
        assert.match(logs, new RegExp(`reply_fallback.*reason=${reason}`));
      } else assert.doesNotMatch(logs, /\[debug\]/);
      assert.doesNotMatch(logs, /PRIVATE_RESPONSE|PRIVATE_REVIEW|I arrived/);
    }
  }
});

test('FR-160: decision review logs verdict probabilities and threshold, including recovery to accepted', async () => {
  const config = cfg();
  config.logging = { level: 'debug' };
  let count = 0;
  const decision = {
    available: true,
    async evaluate() {
      const probability = ++count === 1 ? 0.69 : 0.7;
      return {
        grounding: { choice: 'supported', probabilities: { supported: probability } },
        relevance: { choice: 'relevant', probabilities: { relevant: 0.95 } },
      };
    },
  };
  const f = fixture(() => reply('agent_review_reply', { grounded: false, relevant: true }), {
    config,
    decision,
  });
  await f.policy.onTurn({ events: [] }, f.context);
  const logs = f.logs.join('\n');
  assert.match(
    logs,
    /reply_review.*source=decision.*outcome=rejected.*reason=low_confidence.*groundingProbability=0.69.*threshold=0.7/,
  );
  assert.match(logs, /reply_review.*outcome=accepted.*groundingProbability=0.7/);
  assert.doesNotMatch(logs, /reply_fallback|I arrived/);
  assert.equal(f.calls[0].args.text, 'I arrived at the piano and played it.');
});

test('BUG-175: a negative relevance decision gets an independent check before rewriting a valid greeting', async () => {
  const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    draft: 'Hey! How’s it going?',
    decision: {
      available: true,
      async evaluate() {
        return {
          grounding: { choice: 'supported', probabilities: { supported: 0.66 } },
          relevance: { choice: 'irrelevant', probabilities: { relevant: 0.3 } },
        };
      },
    },
  });
  f.context.observation.players[0].text = 'whatsup';
  await f.policy.onTurn(
    { events: [{ type: 'speech', player: f.context.observation.players[0] }] },
    f.context,
  );
  assert.equal(f.checks, 1);
  assert.equal(f.calls[0].args.text, 'Hey! How’s it going?');
});

test('BUG-175: failed review never asks the visitor to clarify or consumes a correction attempt', async () => {
  const f = fixture(() => new Response('private', { status: 503 }));
  await f.policy.onTurn({ events: [] }, f.context);
  assert.equal(f.checks, 1);
  assert.equal(f.requests, 2);
  assert.doesNotMatch(f.calls[0].args.text, /clarify|what you.d like/i);
});

test('BUG-175: explicit unsupported claims stay blocked without an independent override', async () => {
  const f = fixture(
    () => {
      throw new Error('Must not adjudicate an unsupported claim');
    },
    {
      decision: {
        available: true,
        async evaluate() {
          return { grounding: { choice: 'unsupported' }, relevance: { choice: 'relevant' } };
        },
      },
    },
  );
  await f.policy.onTurn({ events: [] }, f.context);
  assert.equal(f.checks, 0);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].args.text, /trouble replying/);
});

test('BUG-175: cancellation during independent review prevents publishing and tracing failure cannot alter acceptance', async () => {
  const decision = {
    available: true,
    async evaluate() {
      return { grounding: { choice: 'supported' }, relevance: { choice: 'irrelevant' } };
    },
  };
  const cancelled = fixture(
    ({ abort }) => {
      abort.abort();
      return reply('agent_review_reply', { grounded: true, relevant: true });
    },
    { decision },
  );
  await assert.rejects(cancelled.policy.onTurn({ events: [] }, cancelled.context), {
    name: 'AbortError',
  });
  assert.equal(cancelled.calls.length, 0);
  const accepted = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    decision,
    draft: 'Hey!',
    onReplyTrace: async () => {
      throw new Error('trace sink failed');
    },
  });
  await accepted.policy.onTurn({ events: [] }, accepted.context);
  assert.equal(accepted.calls[0].args.text, 'Hey!');
});

test('BUG-175: review target follows fresh focused speech and distinguishes proactive greetings from old bubbles', () => {
  const a = { id: 'a', text: 'whatsup' },
    b = { id: 'b', text: 'old question' };
  const observation = { players: [a, b] };
  assert.deepEqual(
    replyTarget(
      [
        { type: 'speech', player: a },
        { type: 'speech', player: b },
        { type: 'social', focus: 'a' },
      ],
      observation,
      'Bot',
    ),
    { agentName: 'Bot', kind: 'reply', speaker: 'a', message: 'whatsup' },
  );
  assert.equal(
    replyTarget([{ type: 'social', greeting: 'a' }], observation, 'Bot').kind,
    'greeting',
  );
  assert.equal(
    replyTarget([{ type: 'speech', player: { id: 'gone', text: 'hidden' } }], observation, 'Bot')
      .message,
    undefined,
  );
});

test('BUG-175: review traces include the exact target, draft and verdict without changing accepted speech', async () => {
  const records = [];
  const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
    draft: 'Hey! How’s it going?',
    onReplyTrace: async record => records.push(record),
  });
  const player = { ...f.context.observation.players[0], text: 'whatsup' };
  f.context.observation.players = [player];
  await f.policy.onTurn({ events: [{ type: 'speech', player }] }, f.context);
  assert.equal(records.length, 1);
  assert.equal(records[0].state.target.message, 'whatsup');
  assert.equal(records[0].state.draft, f.calls[0].args.text);
  assert.equal(records[0].verdict.accepted, true);
});

test('BUG-175: correction feedback identifies relevance and retains the same current target', async () => {
  const generated = [];
  const f = fixture(
    ({ checks }) => reply('agent_review_reply', { grounded: true, relevant: checks > 1 }),
    {
      draft: 'Hey!',
      onGeneration: body => generated.push(body),
    },
  );
  const player = { ...f.context.observation.players[0], text: 'whatsup' };
  f.context.observation.players = [player];
  await f.policy.onTurn({ events: [{ type: 'speech', player }] }, f.context);
  const correction = JSON.parse(
    generated[1].messages.find(message => message.role === 'user').content,
  );
  assert.equal(correction.reason, 'irrelevant');
  assert.match(generated[1].messages[0].content, /current reply target/);
  assert.match(generated[1].messages[0].content, /one correction attempt/);
  assert.equal(correction.target.message, 'whatsup');
  assert.equal(f.calls.length, 1);
  assert.equal(f.checks, 2);
});

test('BUG-176: consecutive reviews retain published dialogue and confirmed actions without old world snapshots or private drafts', async () => {
  const config = cfg();
  config.limits.maxToolRounds = 6;
  const reviews = [],
    executed = [];
  let step = 0;
  const policy = createModelPolicy({
    config,
    budget: { calls: 0, nextTurn: 0 },
    toolDefinitions: ['scape_speak', 'scape_move'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    decision: {
      available: true,
      async evaluate({ state }) {
        reviews.push(structuredClone(state));
        return {
          grounding: { choice: state.draft === 'REJECTED_DRAFT' ? 'unsupported' : 'supported' },
          relevance: { choice: 'relevant' },
        };
      },
    },
    fetchImpl: async () => {
      const phase = step++ % 3;
      if (phase === 0) return reply('scape_move', { x: 4, y: 5 });
      const payload = await reply('scape_speak', {
        text: phase === 1 ? 'REJECTED_DRAFT' : 'PUBLISHED_REPLY',
      }).json();
      payload.choices[0].message.reasoning = 'PRIVATE_REASONING';
      return Response.json(payload);
    },
  });
  for (let turn = 0; turn < 5; turn++) {
    const player = { id: 'visitor', text: `QUESTION_${turn}` };
    await policy.onTurn(
      { events: [{ type: 'speech', player }] },
      {
        signal: new AbortController().signal,
        observation: {
          self: {},
          players: [player],
          scene: { data: `SNAPSHOT_${turn}` + 'x'.repeat(22000) },
        },
        tools: {
          async call(name, args) {
            executed.push({ name, args });
            return { accepted: true, arrived: false };
          },
        },
      },
    );
  }
  const history = reviews.at(-1).recentTurns;
  const serialized = JSON.stringify(history);
  assert.doesNotMatch(serialized, /SNAPSHOT_|PRIVATE_|REJECTED_DRAFT|DUPLICATE_DRAFT/);
  assert.match(serialized, /PUBLISHED_REPLY/);
  assert.match(serialized, /scape_move/);
  assert.match(serialized, /"arrived":false/);
  assert.match(serialized, /QUESTION_3/);
  assert.doesNotMatch(serialized, /QUESTION_0|QUESTION_1/);
  assert.ok(serialized.length < 4000);
  assert.equal(executed.filter(call => call.name === 'scape_speak').length, 5);
});

test('BUG-176: duplicate speech gets explicit finish guidance and skipped diagnostics while movement still works', async () => {
  const config = cfg();
  config.logging = { level: 'debug' };
  config.limits.maxToolRounds = 5;
  const generated = [],
    logs = [],
    calls = [];
  let step = 0;
  const policy = createModelPolicy({
    config,
    onStatus: line => logs.push(line),
    toolDefinitions: ['scape_speak', 'scape_move'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    decision: {
      available: true,
      async evaluate() {
        return { grounding: { choice: 'supported' }, relevance: { choice: 'relevant' } };
      },
    },
    fetchImpl: async (_, options) => {
      generated.push(JSON.parse(options.body));
      if (++step <= 2) return reply('scape_speak', { text: 'PRIVATE_SPEECH' });
      if (step === 3) return reply('scape_move', { x: 4, y: 5 });
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
        }),
      );
    },
  });
  await policy.onTurn(
    { events: [] },
    {
      signal: new AbortController().signal,
      observation: { self: {}, players: [{ id: 'a' }] },
      tools: {
        async call(name) {
          calls.push(name);
          return { ok: true };
        },
      },
    },
  );
  const response = generated[2].messages.filter(message => message.role === 'tool').at(-1);
  assert.equal(JSON.parse(response.content).code, 'reply_already_published');
  assert.match(response.content, /Finish this turn/);
  assert.deepEqual(calls, ['scape_speak', 'scape_move']);
  assert.match(
    logs.join('\n'),
    /tool_call.*tool=speech.*outcome=skipped.*reason=reply_already_published/,
  );
  assert.doesNotMatch(logs.join('\n'), /outcome=failed|PRIVATE_SPEECH/);
  assert.ok(generated[0].tools.some(tool => tool.function.name === 'scape_speak'));
  assert.ok(
    generated
      .slice(1)
      .every(request => request.tools.every(tool => tool.function.name !== 'scape_speak')),
  );
});

test('BUG-176: history bounds large evidence without converting omissions into success', () => {
  const evidence = Array.from({ length: 100 }, (_, index) => ({
    tool: 'scape_move',
    args: { x: index },
    result: { accepted: false, detail: 'x'.repeat(800) },
  }));
  evidence.push({ tool: 'scape_observe', result: { secretSnapshot: 'x'.repeat(22000) } });
  evidence.push({
    tool: 'scape_interact',
    args: { value: 'x'.repeat(8000) },
    result: { ok: true },
  });
  const result = reviewHistoryTurn({ kind: 'reply', message: 'x'.repeat(5000) }, evidence);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.length <= 4000);
  assert.equal(result.target.messageTruncated, true);
  assert.ok(result.omittedTools > 0);
  assert.deepEqual(result.confirmedTools.at(-1), { tool: 'scape_interact', detailsOmitted: true });
  assert.doesNotMatch(serialized, /secretSnapshot|"ok":true/);
  assert.ok(result.confirmedTools.some(action => action.result?.accepted === false));
});

test('BUG-176: history respects disabled and single-turn retention', async () => {
  for (const historyTurns of [0, 1]) {
    const config = cfg();
    config.limits.historyTurns = historyTurns;
    const reviews = [];
    const f = fixture(
      () => {
        throw new Error('Decision should handle the review');
      },
      {
        config,
        decision: {
          available: true,
          async evaluate({ state }) {
            reviews.push(structuredClone(state));
            return { grounding: { choice: 'supported' }, relevance: { choice: 'relevant' } };
          },
        },
      },
    );
    for (let turn = 0; turn < 3; turn++) await f.policy.onTurn({ events: [] }, f.context);
    assert.equal(reviews.at(-1).recentTurns.length, historyTurns);
  }
});

test('BUG-176: duplicate calls in one batch publish only once even when reply checks are disabled', async () => {
  const config = cfg();
  config.behavior.checkReplies = false;
  let requests = 0,
    published = 0;
  const policy = createModelPolicy({
    config,
    toolDefinitions: [{ name: 'scape_speak', inputSchema: { type: 'object' } }],
    fetchImpl: async () => {
      if (++requests > 1)
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
          }),
        );
      const payload = await reply('scape_speak', { text: 'Hello' }).json();
      const calls = payload.choices[0].message.tool_calls;
      calls.push({ ...calls[0], id: 'duplicate' });
      return new Response(JSON.stringify(payload));
    },
  });
  await policy.onTurn(
    { events: [] },
    {
      signal: new AbortController().signal,
      observation: { players: [{ id: 'a' }] },
      tools: {
        async call() {
          published++;
          return { ok: true };
        },
      },
    },
  );
  assert.equal(published, 1);
});

test('BUG-179: an honest unsupported-action reply has capability evidence and does not become generic fallback', async () => {
  const spoken = [],
    checks = [];
  let generations = 0;
  const policy = createModelPolicy({
    config: cfg(),
    toolDefinitions: ['scape_speak', 'scape_move_to', 'scape_interact', 'scape_guide'].map(
      name => ({ name, inputSchema: { type: 'object' } }),
    ),
    decision: {
      available: true,
      async evaluate({ state }) {
        checks.push(state);
        const supported =
          state.capabilities?.worldEditing === false &&
          state.draft === "I can't break or modify that door. I was getting carried away.";
        return {
          grounding: { choice: supported ? 'supported' : 'unsupported' },
          relevance: { choice: 'relevant' },
        };
      },
    },
    fetchImpl: async () =>
      ++generations === 1
        ? reply('scape_speak', {
            text: "I can't break or modify that door. I was getting carried away.",
          })
        : generations === 2 && !spoken.length
          ? reply('scape_speak', { text: "I'll touch the door and make it creak." })
          : new Response(
              JSON.stringify({
                choices: [
                  { finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } },
                ],
              }),
            ),
  });
  const player = { id: 'visitor', text: 'ok sick. you go first!' };
  await policy.onTurn(
    { events: [{ type: 'speech', player }] },
    {
      signal: new AbortController().signal,
      observation: {
        self: { x: 3, y: 3 },
        players: [player],
        interacting: false,
        movement: { status: 'blocked' },
      },
      tools: {
        async call(_, args) {
          spoken.push(args.text);
          return { ok: true };
        },
      },
    },
  );
  assert.deepEqual(spoken, ["I can't break or modify that door. I was getting carried away."]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].capabilities.movement, true);
  assert.equal(checks[0].capabilities.sessionDialogue, true);
  assert.equal(checks[0].capabilities.persistentNotes, false);
  assert.ok(checks[0].capabilities.objectInteractions.includes('piano'));
});

test('BUG-179: a reviewed correction finishes the turn without returning to the rejected action plan', async () => {
  let requests = 0;
  const calls = [];
  const policy = createModelPolicy({
    config: cfg(),
    toolDefinitions: ['scape_speak', 'scape_move_to'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    decision: {
      available: true,
      async evaluate({ state }) {
        return {
          grounding: { choice: state.draft === 'I opened the door.' ? 'unsupported' : 'supported' },
          relevance: { choice: 'relevant' },
        };
      },
    },
    fetchImpl: async () => {
      requests++;
      if (requests === 1) return reply('scape_speak', { text: 'I opened the door.' });
      if (requests === 2) return reply('scape_speak', { text: 'I cannot open that door.' });
      return reply('scape_move_to', { x: 54, y: 30 });
    },
  });
  await policy.onTurn(
    { events: [] },
    {
      signal: new AbortController().signal,
      observation: { players: [{ id: 'a' }], self: { x: 1, y: 1 }, scene: { objects: [] } },
      tools: {
        async call(name, args) {
          calls.push({ name, args });
          return { ok: true };
        },
      },
    },
  );
  assert.deepEqual(
    calls.map(call => call.name),
    ['scape_speak'],
  );
  assert.equal(requests, 2);
});

test('BUG-179: uncertain negative grounding gets an independent review; confident false claims remain blocked', async () => {
  for (const supported of [0.27, 0.25, 0.02]) {
    const f = fixture(() => reply('agent_review_reply', { grounded: true, relevant: true }), {
      draft: 'I cannot find a piano here.',
      decision: {
        available: true,
        async evaluate() {
          return {
            grounding: {
              choice: 'unsupported',
              probabilities: { supported, unsupported: 1 - supported },
            },
            relevance: { choice: 'relevant', probabilities: { relevant: 0.99 } },
          };
        },
      },
    });
    await f.policy.onTurn({ events: [] }, f.context);
    assert.equal(f.checks, supported === 0.27 ? 1 : 0);
    assert.equal(
      f.calls[0].args.text,
      supported === 0.27
        ? 'I cannot find a piano here.'
        : 'I’m having trouble replying right now. Please try again.',
    );
  }
});

test('BUG-179: conversation-only perception cannot be bypassed with a world action', async () => {
  const calls = [],
    offered = [];
  let requests = 0;
  const config = cfg();
  config.behavior.checkReplies = false;
  const policy = createModelPolicy({
    config,
    toolDefinitions: ['scape_speak', 'scape_interact', 'scape_guide'].map(name => ({
      name,
      inputSchema: { type: 'object' },
    })),
    fetchImpl: async (_, options) => {
      offered.push(JSON.parse(options.body).tools.map(tool => tool.function.name));
      return ++requests === 1
        ? reply('scape_interact', { target: 'piano' })
        : requests === 2
          ? reply('scape_guide', {})
          : reply('scape_speak', { text: 'I cannot break objects here.' });
    },
  });
  await policy.onTurn(
    { events: [{ type: 'social', conversationOnly: true }] },
    {
      signal: new AbortController().signal,
      observation: { players: [{ id: 'a' }] },
      tools: {
        async call(name) {
          calls.push(name);
          return { ok: true };
        },
      },
    },
  );
  assert.ok(offered.every(tools => !tools.includes('scape_interact')));
  assert.ok(offered.every(tools => tools.includes('scape_guide')));
  assert.deepEqual(calls, ['scape_guide', 'scape_speak']);
});
