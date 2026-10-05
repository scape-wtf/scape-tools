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
  assert.equal(
    parseAgentConfig(raw({ type: 'cloudflare', accountId: 'a'.repeat(32) })).decision.model,
    'clef-flash',
  );
  for (const decision of [
    { type: 'cloudflare' },
    { type: 'typesafe', baseUrl: 'https://wrong.example' },
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

for (const type of ['typesafe', 'cloudflare', 'system-one', 'openai-compatible'])
  test(`${type} decision request uses its protocol, isolated key and validated answers`, async () => {
    let calls = 0;
    const config =
      type === 'cloudflare'
        ? { type, accountId: 'a'.repeat(32), model: 'clef' }
        : type === 'typesafe'
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
    assert.equal(client.available, false);
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
