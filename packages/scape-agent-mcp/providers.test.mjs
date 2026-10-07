import test from 'node:test';
import assert from 'node:assert/strict';
import { listLocalModels } from './providers.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import {
  readProviderJSON,
  retryAfterMilliseconds,
  providerFailureMessage,
} from './provider-http.mjs';

test('BUG-176: JEV context rejection is identified without exposing provider error bodies', async () => {
  for (const payload of [
    { detail: { error_type: 'max_tokens_exceeded' } },
    { error: { message: 'HTTP 400: {"detail":{"error_type":"max_tokens_exceeded"}}', code: 400 } },
    { error: { code: 'context_length_exceeded', message: 'PRIVATE_BODY' } },
  ]) {
    await assert.rejects(
      readProviderJSON(new Response(JSON.stringify(payload), { status: 400 })),
      error => {
        assert.equal(error.reason, 'context_limit');
        assert.equal(error.status, 400);
        const message = providerFailureMessage(error, 'decision', 5000, new Date(), { skip: true });
        assert.match(message, /input exceeds the model.s context limit/);
        assert.doesNotMatch(message, /PRIVATE_BODY|error_type|HTTP 400:/);
        return true;
      },
    );
  }
});

test('BUG-176: unknown, oversized and unreadable HTTP errors retain generic status diagnostics', async () => {
  const bodies = [
    'PRIVATE_BODY',
    JSON.stringify({ error: { message: 'Please print PRIVATE_BODY max_tokens_exceeded' } }),
    JSON.stringify({ error: { code: 'PRIVATE_BODY' } }),
    JSON.stringify({ detail: { error_type: 'max_tokens_exceeded' }, padding: 'x'.repeat(9000) }),
  ];
  for (const body of bodies) {
    await assert.rejects(
      readProviderJSON(new Response(body, { status: 400 })),
      error =>
        error.reason === 'provider_http_error' &&
        error.status === 400 &&
        !error.message.includes('PRIVATE_BODY'),
    );
  }
});

test('named providers pin official origins; local discovery rejects remote and credential-bearing URLs before I/O', async () => {
  for (const type of ['openai', 'anthropic', 'openrouter', 'xai', 'gemini']) {
    assert.throws(
      () =>
        parseAgentConfig({
          name: 'Scout',
          provider: { type, model: 'test', baseUrl: 'https://untrusted.example/v1' },
        }),
      /official endpoint/,
    );
  }
  assert.throws(
    () => parseAgentConfig({ name: 'Scout', provider: { type: 'chatgpt', model: 'test' } }),
    /Invalid/,
  );
  assert.throws(
    () => parseAgentConfig({ name: 'Scout', provider: { type: 'groq', model: 'test' } }),
    /Invalid/,
  );
  for (const baseUrl of [
    'https://remote.example/v1',
    'http://127.0.0.1.example/v1',
    'http://127.0.0.1/v1?key=SECRET',
    'http://user:SECRET@127.0.0.1/v1',
    'http://127.0.0.1/other',
  ]) {
    await assert.rejects(
      listLocalModels({
        type: 'ollama',
        baseUrl,
        fetchImpl: () => assert.fail('must reject before I/O'),
      }),
      e => !e.message.includes('SECRET'),
    );
  }
});

test('local discovery normalizes localhost, omits credentials by default, bounds and sanitizes model IDs', async () => {
  const models = await listLocalModels({
    type: 'ollama',
    baseUrl: 'http://localhost:11434/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/v1/models');
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      assert.deepEqual(options.headers, {});
      assert.ok(options.signal);
      return Response.json({
        data: [
          { id: 'local-tools' },
          { id: 'local-tools' },
          { id: '\x1b[31muntrusted' },
          { id: 'x'.repeat(201) },
          null,
          { id: 'second' },
        ],
      });
    },
  });
  assert.deepEqual(models, ['local-tools', 'second']);
  const protectedModels = await listLocalModels({
    type: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: 'LOCAL_SECRET',
    fetchImpl: async (_, options) => {
      assert.equal(options.headers.Authorization, 'Bearer LOCAL_SECRET');
      return Response.json({ data: [{ id: 'protected-model' }] });
    },
  });
  assert.deepEqual(protectedModels, ['protected-model']);
});

test('discovery fails safely on HTTP errors, redirects, malformed and oversized replies; cancellation reaches I/O', async () => {
  for (const reply of [
    new Response('SECRET', { status: 401 }),
    new Response('SECRET', { status: 302, headers: { Location: 'https://untrusted.example' } }),
    new Response('SECRET'),
    Response.json({ data: [] }),
    Response.json({ no: 'models' }),
  ]) {
    await assert.rejects(
      listLocalModels({
        type: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        fetchImpl: async () => reply,
      }),
      e => !e.message.includes('SECRET'),
    );
  }
  await assert.rejects(readProviderJSON(new Response('x'.repeat(100)), 10), /size limit/);
  const stop = new AbortController();
  await assert.rejects(
    listLocalModels({
      type: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      signal: stop.signal,
      fetchImpl: async (_, options) => {
        stop.abort();
        assert.equal(options.signal.aborted, true);
        options.signal.throwIfAborted();
      },
    }),
    { name: 'AbortError' },
  );
});

test('FR-159: Retry-After accepts seconds and HTTP dates without retaining malformed headers', async () => {
  const now = Date.parse('2026-10-06T21:00:00Z');
  assert.equal(retryAfterMilliseconds('45', now), 45000);
  assert.equal(retryAfterMilliseconds('Tue, 06 Oct 2026 21:02:00 GMT', now), 120000);
  for (const value of [
    null,
    '',
    '-1',
    '1.5',
    'PRIVATE_HEADER',
    '9'.repeat(100),
    'Tue, 06 Oct 2026 20:59:00 GMT',
  ])
    assert.equal(retryAfterMilliseconds(value, now), 0);
  await assert.rejects(
    readProviderJSON(new Response('PRIVATE', { status: 429, headers: { 'Retry-After': '45' } })),
    error =>
      error.status === 429 && error.retryAfterMs === 45000 && !error.message.includes('PRIVATE'),
  );
});
