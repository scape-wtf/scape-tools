import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createDecisionClient, validateDecisionAnswers } from './decision.mjs';
import { parseAgentConfig } from './runner-config.mjs';
const questions = {
  action: {
    type: 'choice',
    instructions: 'Choose',
    criteria: { reply: 'Reply', ignore: 'Ignore' },
  },
  need: { type: 'noul', instructions: 'Needed?' },
  interest: { type: 'score', instructions: 'Interest', criteria: ['None', 'Some', 'High'] },
};
const answers = {
  action: {
    type: 'choice',
    choice: 'reply',
    confidence: 0.8,
    probabilities: { reply: 0.9, ignore: 0.1 },
  },
  need: { type: 'noul', noul: 0.8 },
  interest: { type: 'score', score: 1.7, probabilities: { 0: 0.1, 1: 0.1, 2: 0.8 } },
};
const raw = decision => ({ name: 'Scout', provider: { type: 'ollama', model: 'test' }, decision });
const compatible = {
  type: 'system-one',
  baseUrl: 'http://127.0.0.1:1234/decide',
  model: 'any-model',
  apiKeyEnv: null,
  minIntervalMs: 250,
};

test('decision config preserves optional setup and pins named providers and dedicated secrets', () => {
  assert.equal(parseAgentConfig(raw(undefined)).decision, undefined);
  assert.equal(parseAgentConfig(raw({ type: 'typesafe' })).decision.model, 'jev-latest');
  assert.equal(parseAgentConfig(raw({ type: 'openrouter' })).decision.model, 'typesafe/jev-1.13');
  assert.equal(
    parseAgentConfig(raw({ type: 'cloudflare', accountId: 'a'.repeat(32) })).decision.model,
    'clef-flash',
  );
  for (const decision of [
    { type: 'cloudflare' },
    { type: 'typesafe', baseUrl: 'https://wrong.example' },
    { type: 'openrouter', baseUrl: 'https://wrong.example' },
    { ...compatible, baseUrl: 'http://remote.example/decide' },
    { ...compatible, baseUrl: 'https://user:secret@example.test/decide' },
    { ...compatible, apiKeyEnv: 'SCAPE_AGENT_TOKEN' },
    { ...compatible, timeoutMs: 0 },
    { type: 'custom', adapter: 'https://example.test/code.mjs' },
  ])
    assert.throws(() => parseAgentConfig(raw(decision)));
  assert.throws(
    () => parseAgentConfig({ ...raw(compatible), behavior: { enabled: false } }),
    /shared/,
  );
  assert.throws(
    () => parseAgentConfig({ ...raw(compatible), policy: 'local.mjs' }),
    /custom policies/i,
  );
});

for (const type of ['openrouter', 'typesafe', 'cloudflare', 'system-one', 'openai-compatible'])
  test(`${type} decision request uses its protocol, isolated key and validated answers`, async () => {
    let calls = 0;
    const config =
      type === 'cloudflare'
        ? { type, accountId: 'a'.repeat(32), model: 'clef' }
        : ['openrouter', 'typesafe'].includes(type)
          ? { type }
          : { ...compatible, type };
    const client = await createDecisionClient({
      config,
      apiKey: 'DECISION_SECRET',
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(options.headers.Authorization, 'Bearer DECISION_SECRET');
        assert.equal(options.redirect, 'error');
        assert.equal(options.credentials, 'omit');
        const body = JSON.parse(options.body);
        assert.ok(!options.body.includes('DECISION_SECRET'));
        if (type === 'cloudflare') {
          assert.equal(
            url,
            `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/run/@cf/cloudflare/clef`,
          );
          assert.equal(body.model, 'clef');
          return Response.json({ success: true, result: { answers } });
        }
        if (type === 'typesafe') assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
        if (type === 'openrouter') {
          assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
          assert.equal(body.model, 'typesafe/jev-1.13');
          assert.equal(body.messages, undefined);
        }
        if (type === 'openai-compatible') {
          assert.equal(url, compatible.baseUrl + '/chat/completions');
          assert.equal(body.response_format.type, 'json_schema');
          assert.equal(body.tools, undefined);
          return Response.json({
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: JSON.stringify({ answers }) },
              },
            ],
          });
        }
        assert.deepEqual(body.questions, questions);
        return Response.json({ answers, secret: 'NOT_FOR_PROMPTS' });
      },
    });
    assert.deepEqual(await client.evaluate({ state: { text: 'Hello' }, questions }), answers);
    assert.equal(calls, 1);
    await client.close();
  });

test('malformed or adversarial answers cannot introduce options or invalid distributions', () => {
  assert.deepEqual(validateDecisionAnswers(questions, answers), answers);
  for (const replacement of [
    { ...answers, extra: {} },
    { ...answers, need: { type: 'noul', noul: 2 } },
    { ...answers, action: { type: 'choice', choice: 'shell' } },
    { ...answers, action: { type: 'choice', choice: 'reply', confidence: NaN } },
    {
      ...answers,
      action: { type: 'choice', choice: 'reply', probabilities: { reply: 1, ignore: 1 } },
    },
    { ...answers, interest: { type: 'score', score: 99 } },
    {},
  ])
    assert.throws(() => validateDecisionAnswers(questions, replacement));
  const minimal = {
    ...answers,
    action: { type: 'choice', choice: 'reply', explanation: 'SECRET' },
  };
  assert.deepEqual(validateDecisionAnswers(questions, minimal).action, {
    type: 'choice',
    choice: 'reply',
  });
});

test('decision budget and failure fallback stop further paid calls and sanitize errors', async () => {
  for (const fail of [false, true]) {
    let calls = 0;
    const messages = [];
    const client = await createDecisionClient({
      config: { ...compatible, maxRequests: 1 },
      onStatus: s => messages.push(s),
      fetchImpl: async () => {
        calls++;
        if (fail) throw new Error('CREDENTIAL_SECRET');
        return Response.json({ answers });
      },
    });
    assert.equal(!!(await client.evaluate({ state: {}, questions })), !fail);
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    assert.equal(calls, 1);
    assert.equal(messages.length, 1);
    assert.doesNotMatch(messages.join(''), /CREDENTIAL_SECRET/);
  }
});

test('timeouts, cancellation and late responses never become decisions', async () => {
  const keeper = setTimeout(() => {}, 1000);
  try {
    const timed = await createDecisionClient({
      config: { ...compatible, timeoutMs: 250 },
      fetchImpl: () => new Promise(() => {}),
    });
    assert.equal(await timed.evaluate({ state: {}, questions }), null);
    let finish;
    const shutdown = new AbortController();
    const cancelled = await createDecisionClient({
      config: compatible,
      fetchImpl: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    });
    const pending = cancelled.evaluate({ state: {}, questions }, { signal: shutdown.signal });
    await delay(0);
    shutdown.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    finish(Response.json({ answers }));
    // A cancelled turn does not disable subsequent evaluations or reset its charged request count.
    const invalid = await createDecisionClient({
      config: compatible,
      fetchImpl: async () => Response.json({ answers: {} }),
    });
    assert.equal(await invalid.evaluate({ state: {}, questions }), null);
  } finally {
    clearTimeout(keeper);
  }
});

test('custom local adapter shares the typed contract and receives no game context', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-decision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'adapter.mjs'),
    `export default options=>({async evaluate(request,{signal}){if(Object.keys(options).some(k=>!['model','baseUrl','apiKey'].includes(k)))throw new Error('Unexpected context');signal.throwIfAborted();return {answers:${JSON.stringify(answers)}};}});`,
  );
  const client = await createDecisionClient({
    config: { type: 'custom', adapter: './adapter.mjs' },
    directory,
  });
  assert.deepEqual(await client.evaluate({ state: {}, questions }), answers);
  await client.close();
  await assert.rejects(
    createDecisionClient({ config: { type: 'custom', adapter: 'missing.mjs' }, directory }),
    /Cannot load/,
  );
});

test('invalid question sets and oversized input are rejected before any provider request', async () => {
  let calls = 0;
  const client = await createDecisionClient({
    config: compatible,
    fetchImpl: async () => {
      calls++;
      return Response.json({ answers });
    },
  });
  await assert.rejects(client.evaluate({ state: {}, questions: {} }), /questions/);
  await assert.rejects(client.evaluate({ state: { text: 'x'.repeat(128001) }, questions }), /size/);
  assert.equal(calls, 0);
});

test('HTTP failures, Cloudflare error envelopes and incomplete structured output fall back once without raw errors', async () => {
  for (const type of ['system-one', 'cloudflare', 'openai-compatible']) {
    let calls = 0;
    const messages = [];
    const config =
      type === 'cloudflare' ? { type, accountId: 'a'.repeat(32) } : { ...compatible, type };
    const client = await createDecisionClient({
      config,
      apiKey: 'SECRET',
      onStatus: s => messages.push(s),
      fetchImpl: async () => {
        calls++;
        if (type === 'system-one') return new Response('SECRET_PROVIDER_DETAIL', { status: 401 });
        if (type === 'cloudflare')
          return Response.json({ success: false, errors: [{ message: 'SECRET_PROVIDER_DETAIL' }] });
        return Response.json({
          choices: [
            {
              finish_reason: 'length',
              message: { role: 'assistant', content: 'SECRET_PROVIDER_DETAIL' },
            },
          ],
        });
      },
    });
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    assert.equal(client.available, type === 'openai-compatible');
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    assert.equal(calls, 1);
    assert.doesNotMatch(messages.join(''), /SECRET/);
  }
});

test('pacing remains cancellable without spending another request and concurrent calls are rejected', async () => {
  let calls = 0;
  const client = await createDecisionClient({
    config: { ...compatible, minIntervalMs: 1000 },
    fetchImpl: async () => {
      calls++;
      return Response.json({ answers });
    },
  });
  await client.evaluate({ state: {}, questions });
  const controller = new AbortController(),
    pending = client.evaluate({ state: {}, questions }, { signal: controller.signal });
  await assert.rejects(client.evaluate({ state: {}, questions }), /serialized/);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.equal(client.available, true);
});

test('BUG-173: decision fallback reports safe HTTP, timeout and answer-validation diagnostics once', async () => {
  for (const [fetchImpl, expected] of [
    [
      async () => new Response('PRIVATE_BODY', { status: 400 }),
      /provider_http_error.*HTTP 400.*request format/i,
    ],
    [
      async () => new Response('PRIVATE_BODY', { status: 403 }),
      /provider_http_error.*HTTP 403.*access/i,
    ],
    [
      async () => new Response('PRIVATE_BODY', { status: 429 }),
      /provider_http_error.*HTTP 429.*rate|quota/i,
    ],
    [async () => Response.json({ answers: {} }), /invalid_answers/i],
    [async () => new Response('PRIVATE_JSON'), /invalid_json/i],
    [
      async () => {
        throw new TypeError('PRIVATE_NETWORK', { cause: { code: 'ECONNRESET' } });
      },
      /connection_reset/i,
    ],
    [() => new Promise(() => {}), /request_timeout.*250ms/i],
  ]) {
    let calls = 0;
    const messages = [];
    const client = await createDecisionClient({
      config: { type: 'openrouter', timeoutMs: 250 },
      apiKey: 'PRIVATE_KEY',
      fetchImpl: (...args) => {
        calls++;
        return fetchImpl(...args);
      },
      onStatus: message => messages.push(message),
    });
    const keeper = setTimeout(() => {}, 1000);
    try {
      assert.equal(await client.evaluate({ state: {}, questions }), null);
      assert.equal(await client.evaluate({ state: {}, questions }), null);
      assert.equal(calls, 1);
      assert.equal(messages.length, 1);
      assert.match(messages[0], expected);
      assert.match(messages[0], /^\d{4}-\d{2}-\d{2}T.*Decision model unavailable/);
      assert.doesNotMatch(messages[0], /PRIVATE_|Bearer|https?:\/\//);
    } finally {
      clearTimeout(keeper);
      await client.close();
    }
  }
});

test('FR-159: transient decision failures recover with fresh input, capped backoff and Retry-After', async () => {
  let clock = Date.now(),
    calls = 0;
  const messages = [],
    sent = [];
  const client = await createDecisionClient({
    config: compatible,
    now: () => clock,
    onStatus: message => messages.push(message),
    fetchImpl: async (_url, options) => {
      sent.push(JSON.parse(options.body).state);
      calls++;
      if (calls === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '45' } });
      if (calls < 9) return new Response(null, { status: 503 });
      return Response.json({ answers });
    },
  });
  assert.equal(await client.evaluate({ state: { version: 1 }, questions }), null);
  assert.equal(client.available, false);
  clock += 44000;
  assert.equal(await client.evaluate({ state: { version: 2 }, questions }), null);
  assert.equal(calls, 1);
  clock += 1001;
  assert.equal(client.available, true);
  for (const milliseconds of [2000, 4000, 8000, 16000, 30000, 30000, 30000]) {
    assert.equal(await client.evaluate({ state: { version: calls + 1 }, questions }), null);
    assert.match(messages.at(-1), new RegExp(`after ${milliseconds / 1000}s`));
    clock += milliseconds;
  }
  assert.deepEqual(await client.evaluate({ state: { version: 99 }, questions }), answers);
  assert.deepEqual(sent.at(-1), { version: 99 });
  assert.match(messages.at(-1), /restored/i);
  await client.close();
});

test('FR-159: bad requests and invalid answers skip identical input but allow a fresh evaluation', async () => {
  for (const failure of [400, 422, 'invalid']) {
    let clock = 0,
      calls = 0;
    const client = await createDecisionClient({
      config: compatible,
      now: () => clock,
      fetchImpl: async () =>
        ++calls === 1
          ? failure === 'invalid'
            ? Response.json({ answers: {} })
            : new Response(null, { status: failure })
          : Response.json({ answers }),
    });
    assert.equal(await client.evaluate({ state: { version: 1 }, questions }), null);
    clock += 1000;
    assert.equal(client.available, true);
    assert.equal(await client.evaluate({ state: { version: 1 }, questions }), null);
    assert.equal(calls, 1);
    assert.deepEqual(await client.evaluate({ state: { version: 2 }, questions }), answers);
    clock += 1000;
    assert.equal(await client.evaluate({ state: { version: 1 }, questions }), null);
    assert.equal(calls, 2);
    await client.close();
  }
});

test('FR-159: credentials, credits and exhausted retry budget suspend decision calls', async () => {
  for (const status of [401, 402, 403, 503]) {
    let clock = 0,
      calls = 0;
    const messages = [];
    const client = await createDecisionClient({
      config: { ...compatible, maxRequests: 2 },
      now: () => clock,
      onStatus: message => messages.push(message),
      fetchImpl: async () => {
        calls++;
        return new Response('PRIVATE', { status });
      },
    });
    await client.evaluate({ state: {}, questions });
    clock += 31000;
    await client.evaluate({ state: { fresh: true }, questions });
    clock += 31000;
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    assert.equal(calls, status === 503 ? 2 : 1);
    assert.equal(client.available, false);
    assert.match(messages.at(-1), status === 503 ? /limit reached/ : /restart/i);
    await client.close();
  }
});

test('FR-159: close aborts active decisions and cooldown never starts a background request', async () => {
  let receivedSignal,
    calls = 0;
  const client = await createDecisionClient({
    config: compatible,
    fetchImpl: (_url, { signal }) => {
      calls++;
      receivedSignal = signal;
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
    },
  });
  const pending = client.evaluate({ state: {}, questions });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await delay(0);
  await client.close();
  await rejected;
  assert.equal(receivedSignal.aborted, true);
  assert.equal(client.available, false);
  await assert.rejects(client.evaluate({ state: {}, questions }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('FR-159: timed-out adapters cannot overlap a retry or publish a late result', async () => {
  let clock = 0,
    calls = 0,
    finish;
  const client = await createDecisionClient({
    config: { ...compatible, timeoutMs: 250 },
    now: () => clock,
    fetchImpl: () => {
      calls++;
      return calls === 1
        ? new Promise(resolve => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ answers }));
    },
  });
  const keeper = setTimeout(() => {}, 1000);
  try {
    assert.equal(await client.evaluate({ state: {}, questions }), null);
    clock += 2000;
    assert.equal(client.available, false);
    assert.equal(await client.evaluate({ state: { fresh: true }, questions }), null);
    assert.equal(calls, 1);
    finish(Response.json({ answers }));
    await delay(0);
    assert.equal(client.available, true);
    assert.deepEqual(await client.evaluate({ state: { fresh: true }, questions }), answers);
    assert.equal(calls, 2);
  } finally {
    clearTimeout(keeper);
    await client.close();
  }
});

test('FR-159: network and timeout recovery reset backoff after success; cancelled turns never retry', async () => {
  for (const timeout of [false, true]) {
    let clock = 0,
      calls = 0;
    const messages = [];
    const client = await createDecisionClient({
      config: { ...compatible, timeoutMs: 250 },
      now: () => clock,
      onStatus: message => messages.push(message),
      fetchImpl: async (_url, { signal }) => {
        calls++;
        if (calls === 1 && timeout)
          return new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
          );
        if (calls === 1 || calls === 3)
          throw new TypeError('PRIVATE', { cause: { code: 'ECONNRESET' } });
        return Response.json({ answers });
      },
    });
    const keeper = setTimeout(() => {}, 1000);
    try {
      assert.equal(await client.evaluate({ state: {}, questions }), null);
      const cancelled = new AbortController();
      cancelled.abort();
      await assert.rejects(
        client.evaluate({ state: {}, questions }, { signal: cancelled.signal }),
        { name: 'AbortError' },
      );
      assert.equal(calls, 1);
      clock += 1000;
      assert.deepEqual(await client.evaluate({ state: {}, questions }), answers);
      clock += 1000;
      assert.equal(await client.evaluate({ state: {}, questions }), null);
      assert.match(messages.at(-1), /after 1s/);
    } finally {
      clearTimeout(keeper);
      await client.close();
    }
  }
});

test('FR-160: decision diagnostics report request failure, cooldown and recovery without state', async () => {
  let clock = 0,
    calls = 0;
  const events = [];
  const client = await createDecisionClient({
    config: compatible,
    now: () => clock,
    onDiagnostic: (event, fields) => events.push({ event, ...fields }),
    fetchImpl: async () =>
      ++calls === 1 ? new Response('PRIVATE_ERROR', { status: 503 }) : Response.json({ answers }),
  });
  const request = { state: { text: 'PRIVATE_STATE' }, questions };
  assert.equal(await client.evaluate(request), null);
  assert.equal(await client.evaluate(request), null);
  clock = 1000;
  assert.deepEqual(await client.evaluate(request), answers);
  assert.ok(
    events.some(
      e => e.phase === 'failed' && e.status === 503 && e.retryMs === 1000 && e.recovery === 'retry',
    ),
  );
  assert.ok(events.some(e => e.event === 'decision_skip' && e.reason === 'cooldown'));
  assert.ok(events.some(e => e.phase === 'complete' && e.request === 2));
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_ERROR|PRIVATE_STATE/);
  await client.close();
});

test('BUG-179: production reply questions pass the real decision client validation boundary', async () => {
  const { reviewQuestions } = await import('./reply-review.mjs');
  let requested = false;
  const client = await createDecisionClient({
    config: { type: 'openrouter' },
    apiKey: 'fixture',
    fetchImpl: async () => {
      requested = true;
      return Response.json({
        answers: {
          grounding: { type: 'choice', choice: 'supported' },
          relevance: { type: 'choice', choice: 'relevant' },
        },
      });
    },
  });
  try {
    const result = await client.evaluate({
      state: { draft: 'Hello!' },
      questions: reviewQuestions,
    });
    assert.equal(requested, true);
    assert.equal(result.grounding.choice, 'supported');
  } finally {
    await client.close();
  }
});
