import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPolicy as createPolicy } from './model-policy.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

const definitions = [
  'scape_speak',
  'scape_follow',
  'scape_guide',
  'scape_leave',
  'scape_set_avatar',
  'scape_pair',
  'scape_enter',
].map(name => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}));
const config = (type, limits = {}) =>
  parseAgentConfig({
    name: 'Scout',
    provider: {
      type,
      model: 'fixture-model',
      ...(type === 'openai-compatible' ? { baseUrl: 'http://127.0.0.1:1/v1' } : {}),
    },
    limits: { minTurnIntervalMs: 500, ...limits },
  });
const context = () => ({
  signal: new AbortController().signal,
  observation: {
    status: 'connected',
    self: { id: 'agent' },
    players: [{ id: 'visitor', text: 'Hello' }],
  },
  tools: { call: async () => ({ ok: true }) },
  stop() {},
});
const response = body =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function reply(type, call) {
  if (['openai', 'xai'].includes(type))
    return {
      status: 'completed',
      output: call
        ? [
            {
              type: 'function_call',
              call_id: 'call-1',
              name: call.name,
              arguments: JSON.stringify(call.args),
            },
          ]
        : [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Done' }],
            },
          ],
    };
  if (type === 'anthropic')
    return {
      stop_reason: call ? 'tool_use' : 'end_turn',
      content: call
        ? [{ type: 'tool_use', id: 'call-1', name: call.name, input: call.args }]
        : [{ type: 'text', text: 'Done' }],
    };
  return {
    choices: [
      {
        finish_reason: call ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: call ? null : 'Done',
          ...(call
            ? {
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.args) },
                  },
                ],
              }
            : {}),
        },
      },
    ],
  };
}

// Existing provider-loop fixtures also answer the separate private review request.
// Dedicated reply-check tests exercise rejection, cancellation and publication bounds.
function createModelPolicy(options) {
  return createPolicy({
    ...options,
    fetchImpl: async (url, request) => {
      const body = JSON.parse(request.body),
        review = body.tools?.some(t => (t.function?.name ?? t.name) === 'agent_review_reply');
      if (review)
        return response(
          reply(options.config.provider.type, {
            name: 'agent_review_reply',
            args: { grounded: true, relevant: true },
          }),
        );
      return options.fetchImpl(url, request);
    },
  });
}

test('BUG-154: real MCP tool schemas work with providers that reject Unicode regex classes', async t => {
  const client = new Client({ name: 'schema-regression', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'https://schema-test.invalid'],
      env: {},
      stderr: 'pipe',
    }),
  );
  const { tools } = await client.listTools();
  const original = structuredClone(tools);
  assert.match(
    tools.find(t => t.name === 'scape_speak').inputSchema.properties.text.pattern,
    /\\p\{/,
  );
  for (const type of [
    'openrouter',
    'openai',
    'xai',
    'anthropic',
    'gemini',
    'ollama',
    'lmstudio',
    'openai-compatible',
  ]) {
    let requests = 0,
      actions = 0;
    const c = context();
    c.tools.call = async () => {
      actions++;
      return { ok: true };
    };
    const policy = createModelPolicy({
      config: config(type),
      toolDefinitions: tools,
      fetchImpl: async (_, options) => {
        requests++;
        const body = JSON.parse(options.body);
        const schemas = body.tools.map(
          t => t.function?.parameters ?? t.parameters ?? t.input_schema,
        );
        // Match the upstream 400 observed with OpenRouter's OpenAI endpoint.
        if (schemas.some(schema => JSON.stringify(schema).includes('\\\\p{'))) {
          const upstream = {
            error: {
              message: "Invalid schema for function 'scape_speak': pattern is not a 'regex'.",
            },
          };
          return new Response(
            JSON.stringify({
              error: {
                message: 'Provider returned error',
                metadata: { raw: JSON.stringify(upstream) },
              },
            }),
            { status: 400 },
          );
        }
        const speak = body.tools.find(t => (t.function?.name ?? t.name) === 'scape_speak');
        if (requests > 1) {
          assert.equal(speak, undefined, 'published speech is no longer offered this turn');
          return response(reply(type, null));
        }
        const schema = speak.function?.parameters ?? speak.parameters ?? speak.input_schema;
        assert.equal(
          schema.properties.text.maxLength,
          original.find(t => t.name === 'scape_speak').inputSchema.properties.text.maxLength,
        );
        assert.deepEqual(schema.required, ['text']);
        assert.equal(schema.additionalProperties, false);
        assert.equal(schema.properties.commandId.pattern, '^[A-Za-z0-9_-]{16,80}$');
        return response(
          reply(
            type,
            requests === 1 ? { name: 'scape_speak', args: { text: 'Hi 🌱 — café!' } } : null,
          ),
        );
      },
    });
    await policy.onTurn({ events: [{ type: 'ready' }] }, c);
    assert.equal(requests, 2);
    assert.equal(actions, 1);
  }
  assert.deepEqual(tools, original, 'provider adaptation must not mutate MCP schemas');
  for (const text of ['unsafe\u0000control', 'unsafe\u202eformat']) {
    const invalid = await client.callTool({ name: 'scape_speak', arguments: { text } });
    assert.equal(
      invalid.isError,
      true,
      'MCP still rejects control/format characters before gateway access',
    );
    assert.match(JSON.stringify(invalid.content), /validation|pattern|regex/i);
  }
});

for (const type of [
  'openai',
  'anthropic',
  'openrouter',
  'xai',
  'gemini',
  'ollama',
  'lmstudio',
  'openai-compatible',
])
  test(`${type}: runs a tool loop with provider-native results and bounded history`, async () => {
    const requests = [],
      actions = [],
      c = context();
    c.tools.call = async (name, args) => {
      actions.push({ name, args });
      return { ok: true };
    };
    const policy = createModelPolicy({
      config: config(type),
      toolDefinitions: definitions,
      apiKey: 'MODEL_KEY_FIXTURE',
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, body, headers: options.headers });
        assert.ok(!options.body.includes('MODEL_KEY_FIXTURE'));
        assert.equal(options.redirect, 'error');
        return response(
          reply(type, requests.length % 2 ? { name: 'scape_speak', args: { text: 'Hi!' } } : null),
        );
      },
    });
    await policy.onTurn({ events: [{ type: 'ready' }] }, c);
    await policy.onTurn(
      { events: [{ type: 'speech', player: { id: 'visitor', text: 'Again' } }] },
      c,
    );
    assert.equal(actions.length, 2);
    assert.equal(requests.length, 4);
    const body = requests[1].body;
    assert.ok(JSON.stringify(body).includes('call-1'));
    assert.ok(JSON.stringify(body).includes('ok'));
    assert.ok(!body.tools.some(t => (t.function?.name ?? t.name) === 'scape_pair'));
    assert.ok(
      body.tools.some(t => (t.function?.name ?? t.name) === 'scape_set_avatar'),
      'all ordinary game capabilities are offered',
    );
    assert.equal(
      type === 'anthropic' ? requests[0].headers['x-api-key'] : requests[0].headers.Authorization,
      type === 'anthropic' ? 'MODEL_KEY_FIXTURE' : 'Bearer MODEL_KEY_FIXTURE',
    );
    if (['openai', 'xai'].includes(type)) {
      assert.equal(body.store, false);
      assert.equal(body.tools[0].strict, false);
      assert.ok(requests[0].url.endsWith('/responses'));
    }
    if (type === 'anthropic') {
      assert.ok(requests[0].url.endsWith('/messages'));
      assert.equal(body.messages.at(-1).content[0].type, 'tool_result');
    }
  });

test('no model call while alone; unsafe tool names never execute', async () => {
  const c = context();
  let requests = 0,
    actions = 0;
  c.tools.call = async () => {
    actions++;
    return {};
  };
  const policy = createModelPolicy({
    config: config('openai'),
    toolDefinitions: definitions,
    fetchImpl: async () =>
      response(
        reply('openai', ++requests === 1 ? { name: 'read_file', args: { path: '.env' } } : null),
      ),
  });
  c.observation.players = [];
  await policy.onTurn({ events: [{ type: 'ready' }] }, c);
  assert.equal(requests, 0);
  c.observation.players = [{ id: 'visitor' }];
  await policy.onTurn({ events: [{ type: 'ready' }] }, c);
  assert.equal(requests, 2);
  assert.equal(actions, 0);
});

test('model can leave through lifecycle without issuing later actions', async () => {
  const c = context();
  let stopped = 0;
  c.stop = () => stopped++;
  c.tools.call = async () => {
    throw new Error('must not call tools');
  };
  const policy = createModelPolicy({
    config: config('anthropic'),
    toolDefinitions: definitions,
    fetchImpl: async () => response(reply('anthropic', { name: 'scape_leave', args: {} })),
  });
  await policy.onTurn({ events: [{ type: 'ready' }] }, c);
  assert.equal(stopped, 1);
});

test('provider errors and malformed output never expose response bodies or secrets', async () => {
  for (const result of [
    new Response('SECRET_ERROR_BODY', { status: 401 }),
    new Response('SECRET_NOT_JSON'),
  ]) {
    const policy = createModelPolicy({
      config: config('openai'),
      toolDefinitions: definitions,
      fetchImpl: async () => result,
    });
    await assert.rejects(
      policy.onTurn({ events: [] }, context()),
      error => !error.message.includes('SECRET'),
    );
  }
});

test('model budget bounds repeated tool calls', async () => {
  let calls = 0;
  const policy = createModelPolicy({
    config: config('openai', { maxModelCalls: 1 }),
    toolDefinitions: definitions,
    fetchImpl: async () => {
      calls++;
      return response(reply('openai', { name: 'scape_guide', args: {} }));
    },
  });
  await assert.rejects(policy.onTurn({ events: [] }, context()), /budget reached/);
  assert.equal(calls, 1);
});

test('FR-153: zero means unlimited requests, including after a shared budget exceeds the old ceiling', async () => {
  const budget = { calls: 100001, nextTurn: 0 };
  const policy = createModelPolicy({
    config: config('openai', { maxModelCalls: 0 }),
    toolDefinitions: definitions,
    budget,
    fetchImpl: async () => response(reply('openai')),
  });
  await policy.onTurn({ events: [] }, context());
  assert.equal(budget.calls, 100002);
  assert.equal(config('openai').limits.maxModelCalls, 200);
  assert.throws(() => config('openai', { maxModelCalls: -1 }));
});

test('BUG-156: tool-round exhaustion ends the decision, retains results and listens for the next event', async () => {
  const c = context(),
    messages = [],
    states = [];
  let requests = 0,
    stops = 0;
  c.stop = () => stops++;
  const policy = createModelPolicy({
    config: config('openrouter', { maxToolRounds: 2 }),
    toolDefinitions: definitions,
    onStatus: s => messages.push(s),
    onState: s => states.push(s),
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body);
      requests++;
      if (requests === 3) {
        assert.equal(body.messages.filter(m => m.role === 'tool').length, 2);
        return response(reply('openrouter'));
      }
      if (requests === 4) {
        assert.deepEqual(
          body.tools.map(tool => tool.function.name),
          ['scape_speak'],
        );
        return response(
          reply('openrouter', { name: 'scape_speak', args: { text: 'Hello again.' } }),
        );
      }
      return response(reply('openrouter', { name: 'scape_guide', args: {} }));
    },
  });
  await policy.onTurn({ events: [] }, c);
  assert.equal(requests, 2);
  assert.equal(stops, 0);
  assert.equal(states.at(-1), 'listening');
  assert.match(messages.at(-1), /tool rounds.*listening/i);
  await policy.onTurn({ events: [{ type: 'speech', player: { id: 'visitor', text: 'Next' } }] }, c);
  assert.equal(requests, 4);
  assert.equal(stops, 0);
});

test('provider processing reports thinking until completion, cancellation or failure', async () => {
  for (const outcome of ['success', 'failure', 'cancel']) {
    const states = [],
      c = context();
    const abort = new AbortController();
    c.signal = abort.signal;
    c.setThinking = async value => states.push(value);
    const policy = createModelPolicy({
      config: config('openrouter'),
      toolDefinitions: definitions,
      fetchImpl: async () => {
        assert.equal(states.at(-1), true);
        if (outcome === 'failure') throw new Error('network failure');
        if (outcome === 'cancel') abort.abort();
        return response(reply('openrouter'));
      },
    });
    if (outcome === 'success') await policy.onTurn({ events: [] }, c);
    else await assert.rejects(policy.onTurn({ events: [] }, c));
    assert.deepEqual(states, [true, false]);
  }
});

test('cancellation reaches provider and prevents late world actions', async () => {
  const shutdown = new AbortController(),
    c = context();
  c.signal = shutdown.signal;
  let actions = 0;
  c.tools.call = async () => {
    actions++;
    return {};
  };
  const policy = createModelPolicy({
    config: config('openai'),
    toolDefinitions: definitions,
    fetchImpl: async (url, { signal }) => {
      shutdown.abort();
      assert.equal(signal.aborted, true);
      return response(reply('openai', { name: 'scape_speak', args: { text: 'late' } }));
    },
  });
  await assert.rejects(policy.onTurn({ events: [] }, c));
  assert.equal(actions, 0);
});

test('config rejects inline credentials, invalid endpoints and missing models before connecting', () => {
  const valid = { name: 'Scout', provider: { type: 'openai', model: 'fixture' } };
  assert.equal(parseAgentConfig(valid).provider.apiKeyEnv, 'OPENAI_API_KEY');
  assert.equal(parseAgentConfig(valid).limits.maxModelCalls, 200);
  for (const provider of [
    { ...valid.provider, apiKey: 'SECRET' },
    { ...valid.provider, apiKeyEnv: 'SCAPE_AGENT_TOKEN' },
    { ...valid.provider, baseUrl: 'https://key:SECRET@host.invalid' },
    { ...valid.provider, baseUrl: 'http://remote.invalid' },
    { ...valid.provider, model: '' },
  ]) {
    assert.throws(
      () => parseAgentConfig({ ...valid, provider }),
      error => !error.message.includes('SECRET'),
    );
  }
  assert.equal(parseAgentConfig({ name: 'Scout', policy: './policy.mjs' }).policy, './policy.mjs');
});

test('Gemini thought signatures are returned unchanged with tool results', async () => {
  let count = 0;
  const first = reply('gemini', { name: 'scape_speak', args: { text: 'Hello' } });
  first.choices[0].message.tool_calls[0].extra_content = {
    google: { thought_signature: 'OPAQUE_SIGNATURE' },
  };
  const policy = createModelPolicy({
    config: config('gemini'),
    toolDefinitions: definitions,
    fetchImpl: async (_, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.parallel_tool_calls, undefined);
      if (count++ === 0) return response(first);
      assert.deepEqual(
        request.messages.find(m => m.role === 'assistant'),
        first.choices[0].message,
      );
      return response(reply('gemini'));
    },
  });
  await policy.onTurn({ events: [] }, context());
  assert.equal(count, 2);
});

test('local inference sends no bearer by default and only documented tool parameters', async () => {
  for (const type of ['ollama', 'lmstudio']) {
    const policy = createModelPolicy({
      config: config(type),
      toolDefinitions: definitions,
      fetchImpl: async (_, options) => {
        assert.equal(options.headers.Authorization, undefined);
        const request = JSON.parse(options.body);
        assert.equal(request.parallel_tool_calls, undefined);
        assert.ok(request.tools.length);
        assert.equal(request.max_tokens, 2048);
        return response(reply(type));
      },
    });
    await policy.onTurn({ events: [] }, context());
  }
});

test('re-entering a world cannot reset the process model-call budget', async () => {
  const budget = { calls: 0, nextTurn: 0 };
  let calls = 0;
  const options = {
    config: config('openai', { maxModelCalls: 1 }),
    toolDefinitions: definitions,
    budget,
    fetchImpl: async () => {
      calls++;
      return response(reply('openai'));
    },
  };
  await createModelPolicy(options).onTurn({ events: [] }, context());
  await assert.rejects(
    createModelPolicy(options).onTurn({ events: [] }, context()),
    /budget reached/,
  );
  assert.equal(calls, 1);
});

for (const type of ['openrouter', 'openai', 'anthropic'])
  test(`accepted plans wait for outcomes and keep valid ${type} provider history`, async () => {
    const requests = [],
      calls = [];
    const cfg = config(type);
    cfg.behavior.checkReplies = false;
    const policy = createPolicy({
      config: cfg,
      toolDefinitions: [...definitions, { name: 'agent_task', inputSchema: { type: 'object' } }],
      fetchImpl: async (_, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (requests.length === 1)
          return response(
            reply(type, {
              name: 'agent_task',
              args: { steps: [{ action: 'approach', target: 'visitor' }] },
            }),
          );
        // Early plan acceptance must not leave an unmatched provider tool call.
        const history = body.messages ?? body.input;
        assert.ok(
          !history.some(
            message =>
              message.tool_calls?.length ||
              message.type === 'function_call' ||
              message.content?.some?.(block => block.type === 'tool_use'),
          ),
        );
        return response(reply(type));
      },
    });
    const ctx = context();
    ctx.tools.call = async (tool, args) => {
      calls.push(tool);
      return { accepted: true, status: 'queued' };
    };
    await policy.onTurn(
      {
        events: [
          { type: 'speech', player: ctx.observation.players[0] },
          { type: 'social', taskPlanning: true },
        ],
      },
      ctx,
    );
    assert.equal(requests.length, 1);
    assert.deepEqual(calls, ['agent_task']);
    await policy.onTurn({ events: [{ type: 'idle' }] }, ctx);
    assert.equal(requests.length, 2);
  });
