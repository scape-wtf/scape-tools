import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recoverConnection,
  connectionFailure,
  recoveryDelay,
  connectionRetryMessage,
  connectionDetails,
} from './recovery.mjs';
import { AgentBridge } from './bridge.mjs';
import { ScapeAgent } from './transport.mjs';
import { mcpTools, runAgentSession } from './runtime.mjs';
import { createModelPolicy } from './model-policy.mjs';
import { parseAgentConfig } from './runner-config.mjs';

const state = sessionId => ({
  sessionId,
  revision: 1,
  status: 'connected',
  room: 'world',
  self: { id: 'agent' },
  players: [],
});

test('FR-153: network failures and expired presence re-enter, but denied access stops recovery', async () => {
  let attempts = 0,
    sessions = 0;
  const pauses = [];
  const denied = Object.assign(new Error('Revoked'), { status: 403, code: 'access_revoked' });
  await assert.rejects(
    recoverConnection({
      signal: new AbortController().signal,
      connect: async () => {
        attempts++;
        if (attempts === 1) throw Object.assign(new Error('Offline'), { code: 'connection_lost' });
        if (attempts === 3) throw denied;
        return state('new');
      },
      run: async observation => {
        assert.equal(observation.sessionId, 'new');
        sessions++;
        throw Object.assign(new Error('Presence ended'), { code: 'session_ended' });
      },
      wait: async ms => pauses.push(ms),
    }),
    error => error === denied,
  );
  assert.equal(attempts, 3);
  assert.equal(sessions, 1);
  assert.deepEqual(pauses, [1000, 2000]);
  assert.equal(recoveryDelay(1000000), 30000);
  for (const code of [
    'unauthorized',
    'access_revoked',
    'permission_denied',
    'removed',
    'stale_session',
  ])
    assert.equal(connectionFailure({ code, status: 503 }), false);
});

test('FR-153: voluntary stops and cancelled retries never reconnect', async () => {
  let calls = 0;
  const abort = new AbortController();
  await recoverConnection({
    signal: abort.signal,
    connect: async () => {
      calls++;
      return state('one');
    },
    run: async () => {},
  });
  assert.equal(calls, 1);
  await recoverConnection({
    signal: abort.signal,
    connect: async () => {
      calls++;
      return state('one');
    },
    run: initialObservation =>
      runAgentSession({
        initialObservation,
        tools: {
          async call(name) {
            if (name === 'scape_leave')
              throw Object.assign(new Error('Offline during leave'), { code: 'connection_lost' });
            return initialObservation;
          },
        },
        createAgent: context => ({
          onTurn() {
            context.stop();
          },
        }),
      }),
  });
  assert.equal(calls, 2, 'failed leave must not reconnect a voluntarily stopped policy');
  await assert.rejects(
    recoverConnection({
      signal: abort.signal,
      connect: async () => {
        throw Object.assign(new Error('Offline'), { status: 503 });
      },
      run: async () => assert.fail('cannot run offline'),
      wait: async (_, __, { signal }) => {
        abort.abort();
        signal.throwIfAborted();
      },
    }),
    { name: 'AbortError' },
  );
});

test('FR-153: observation failure survives bridge/MCP cleanup and restarts with a fresh session', async () => {
  let entered = 0,
    revoked = false,
    observe = 0,
    left = 0;
  const agent = new ScapeAgent({
    origin: 'https://fixture.invalid',
    request: async url => {
      if (revoked)
        return Response.json({ code: 'access_revoked', error: 'Revoked' }, { status: 403 });
      if (url.endsWith('/link/poll')) return Response.json({ approved: true });
      if (url.endsWith('/enter')) return Response.json(state(`session-${++entered}`));
      if (url.endsWith('/observe')) {
        observe++;
        if (entered === 1)
          throw new TypeError('PRIVATE_NETWORK_DETAILS', {
            cause: Object.assign(new Error('PRIVATE_SOCKET'), { code: 'ECONNRESET' }),
          });
        return Response.json(state(`session-${entered}`));
      }
      if (url.endsWith('/leave')) {
        left++;
        return Response.json({ ok: true });
      }
      return Response.json({ ok: true });
    },
  });
  const bridge = new AgentBridge(agent);
  const tools = mcpTools({
    async callTool({ name, arguments: args }, _, options) {
      try {
        const value =
          name === 'scape_enter'
            ? await bridge.enter(options?.signal)
            : name === 'scape_leave'
              ? await bridge.leave()
              : await bridge.observe(args, options?.signal);
        return { structuredContent: value };
      } catch (error) {
        return {
          isError: true,
          structuredContent: {
            error: error.message,
            code: error.code,
            status: error.status,
            ...connectionDetails(error),
          },
        };
      }
    },
  });
  const seen = [];
  const retries = [];
  try {
    await recoverConnection({
      signal: new AbortController().signal,
      onRetry: (ms, error) => retries.push(connectionRetryMessage(error, ms)),
      connect: async () => (await tools.call('scape_enter')).observation,
      run: observation =>
        runAgentSession({
          tools,
          initialObservation: observation,
          createAgent: context => ({
            onTurn() {
              seen.push(context.observation.sessionId);
              if (entered === 2) context.stop();
            },
          }),
        }),
      wait: async () => {},
    });
    assert.equal(entered, 2);
    assert.ok(observe >= 1);
    assert.ok(left >= 1);
    assert.ok(seen.includes('session-2'));
    assert.match(retries[0], /connection_lost.*observe.*connection_reset/);
    assert.doesNotMatch(retries[0], /PRIVATE_/);
    revoked = true;
    await assert.rejects(tools.call('scape_enter'), error => error.status === 403);
  } finally {
    await bridge.close().catch(() => {});
  }
});

test('connection diagnostics explain known failures and never print untrusted details', () => {
  const now = new Date('2026-10-06T19:00:00Z');
  const cases = [
    [{ code: 'session_ended' }, /server-side presence session ended/],
    [{ code: 'not_connected' }, /not connected to the world/],
    [{ status: 429 }, /HTTP 429.*limiting requests/],
    [{ status: 408 }, /HTTP 408.*timed out/],
    [{ status: 502 }, /HTTP 502.*temporarily unavailable/],
    [{ code: 'capacity' }, /service is at capacity/],
    [{ reason: 'world_reconnecting' }, /backend connection to the world is reconnecting/],
    [{ reason: 'world_offline' }, /backend connection to the world is offline/],
    [{ reason: 'unreadable_response' }, /unreadable response/],
  ];
  for (const [error, expected] of cases) {
    const message = connectionRetryMessage({ ...error, operation: 'observe' }, 2000, now);
    assert.match(message, expected);
    assert.match(message, /^2026-10-06T19:00:00.000Z /);
    assert.match(message, /Retrying in 2s\.$/);
  }
  const unsafe = {
    code: 'PRIVATE_CODE',
    status: 'PRIVATE_STATUS',
    reason: 'PRIVATE_REASON',
    operation: 'PRIVATE_OPERATION\x1b[2J',
    message: 'PRIVATE_TOKEN',
    stack: 'PRIVATE_STACK',
    cause: { code: 'PRIVATE_CAUSE' },
  };
  assert.doesNotMatch(connectionRetryMessage(unsafe, 1000, now), /PRIVATE_|\x1b/);
});

test(
  'FR-153: provider failure retries a turn while observations continue',
  { timeout: 5000 },
  async () => {
    let turns = 0,
      observations = 0,
      leaves = 0;
    const initial = state('one');
    await runAgentSession({
      initialObservation: initial,
      tools: {
        async call(name) {
          if (name === 'scape_leave') {
            leaves++;
            return { ok: true };
          }
          observations++;
          return initial;
        },
      },
      createAgent: context => ({
        onTurn() {
          if (++turns === 1)
            throw Object.assign(new Error('Provider down'), { code: 'provider_unavailable' });
          assert.ok(observations > 1);
          context.stop();
        },
      }),
    });
    assert.equal(turns, 2);
    assert.equal(leaves, 1);
  },
);

test(
  'FR-153: a timed-out model turn recovers without replaying acknowledged actions',
  { timeout: 5000 },
  async () => {
    const initial = { ...state('one'), players: [{ id: 'visitor', text: 'Hello' }] };
    let calls = 0,
      actions = 0;
    const config = parseAgentConfig({
      name: 'Scout',
      provider: { type: 'openai', model: 'fixture' },
      behavior: { checkReplies: false },
      limits: { maxModelCalls: 0, turnTimeoutMs: 1000, minTurnIntervalMs: 500 },
    });
    await runAgentSession({
      initialObservation: initial,
      tools: {
        async call(name) {
          if (name === 'scape_observe') return initial;
          if (name === 'scape_follow') actions++;
          return { ok: true };
        },
      },
      createAgent: context =>
        createModelPolicy({
          config,
          toolDefinitions: [{ name: 'scape_follow', inputSchema: {} }],
          fetchImpl: async (_, request) => {
            if (++calls === 1)
              return Response.json({
                status: 'completed',
                output: [
                  {
                    type: 'function_call',
                    call_id: 'follow',
                    name: 'scape_follow',
                    arguments: '{}',
                  },
                ],
              });
            if (calls === 2)
              return new Promise((_, reject) =>
                request.signal.addEventListener('abort', () => reject(request.signal.reason), {
                  once: true,
                }),
              );
            assert.match(request.body, /interrupted_turn/);
            assert.match(request.body, /scape_follow/);
            context.stop();
            return Response.json({ status: 'completed', output: [] });
          },
        }),
    });
    assert.equal(actions, 1);
    assert.equal(calls, 3);
  },
);

test('BUG-173: conversation retries distinguish HTTP, network, output and timeout failures without secrets', async () => {
  const cases = [
    [
      async () => new Response('PRIVATE_BODY', { status: 401 }),
      /provider_http_error.*HTTP 401.*credentials/i,
    ],
    [
      async () => new Response('PRIVATE_BODY', { status: 429 }),
      /provider_http_error.*HTTP 429.*rate|quota/i,
    ],
    [
      async () => new Response('PRIVATE_BODY', { status: 503 }),
      /provider_http_error.*HTTP 503.*unavailable/i,
    ],
    [
      async () => {
        throw new TypeError('PRIVATE_URL', { cause: { code: 'ENOTFOUND' } });
      },
      /dns_failure.*hostname/i,
    ],
    [async () => new Response('PRIVATE_INVALID_JSON'), /invalid_json/i],
    [
      async () =>
        Response.json({
          choices: [
            { finish_reason: 'length', message: { role: 'assistant', content: 'PRIVATE_OUTPUT' } },
          ],
        }),
      /output_limit.*maxOutputTokens/i,
    ],
    [
      async () =>
        Response.json({
          choices: [{ finish_reason: 'content_filter', message: { role: 'assistant' } }],
        }),
      /response_incomplete/i,
    ],
    [
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('PRIVATE_STREAM'));
            },
          }),
        ),
      /unreadable_response/i,
    ],
    [
      async (_url, { signal }) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
      /turn_timeout.*1000ms/i,
    ],
  ];
  for (const [fetchImpl, expected] of cases) {
    const messages = [];
    const policy = createModelPolicy({
      config: parseAgentConfig({
        name: 'Fixture',
        provider: { type: 'openrouter', model: 'fixture' },
        limits: { turnTimeoutMs: 1000 },
      }),
      toolDefinitions: [],
      apiKey: 'PRIVATE_KEY',
      fetchImpl,
      onStatus: message => messages.push(message),
    });
    const context = {
      signal: new AbortController().signal,
      observation: { players: [{ id: 'visitor' }] },
      tools: { call: async () => ({}) },
    };
    // Keep the test alive for AbortSignal.timeout's unref'd timer.
    const keepAlive = setTimeout(() => {}, 2000);
    try {
      await assert.rejects(policy.onTurn({ events: [] }, context), {
        code: 'provider_unavailable',
      });
    } finally {
      clearTimeout(keepAlive);
    }
    assert.equal(messages.length, 1);
    assert.match(messages[0], expected);
    assert.match(messages[0], /^\d{4}-\d{2}-\d{2}T.*Conversation provider unavailable/);
    assert.doesNotMatch(messages[0], /PRIVATE_|Bearer|https?:\/\//);
  }
});
