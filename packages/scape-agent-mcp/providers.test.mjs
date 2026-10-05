import test from 'node:test';
import assert from 'node:assert/strict';
import { listLocalModels } from './providers.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import { readProviderJSON } from './provider-http.mjs';

test('named providers pin official origins; local discovery rejects remote and credential-bearing URLs before I/O', async () => {
  for (const type of ['openai','anthropic','openrouter','xai','gemini']) {
    assert.throws(() => parseAgentConfig({ name: 'Scout', provider: { type, model: 'test', baseUrl: 'https://untrusted.example/v1' } }), /official endpoint/);
  }
  assert.throws(() => parseAgentConfig({ name: 'Scout', provider: { type: 'chatgpt', model: 'test' } }), /Invalid/);
  assert.throws(() => parseAgentConfig({ name: 'Scout', provider: { type: 'groq', model: 'test' } }), /Invalid/);
  for (const baseUrl of ['https://remote.example/v1','http://127.0.0.1.example/v1','http://127.0.0.1/v1?key=SECRET','http://user:SECRET@127.0.0.1/v1','http://127.0.0.1/other']) {
    await assert.rejects(listLocalModels({ type: 'ollama', baseUrl, fetchImpl: () => assert.fail('must reject before I/O') }), e => !e.message.includes('SECRET'));
  }
});

test('local discovery normalizes localhost, omits credentials by default, bounds and sanitizes model IDs', async () => {
  const models = await listLocalModels({ type: 'ollama', baseUrl: 'http://localhost:11434/v1/', fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/v1/models');
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.deepEqual(options.headers, {}); assert.ok(options.signal);
    return Response.json({ data: [{id:'local-tools'}, {id:'local-tools'}, {id:'\x1b[31muntrusted'}, {id:'x'.repeat(201)}, null, {id:'second'}] });
  } });
  assert.deepEqual(models, ['local-tools','second']);
  const protectedModels = await listLocalModels({ type: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'LOCAL_SECRET', fetchImpl: async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer LOCAL_SECRET'); return Response.json({data:[{id:'protected-model'}]});
  } });
  assert.deepEqual(protectedModels, ['protected-model']);
});

test('discovery fails safely on HTTP errors, redirects, malformed and oversized replies; cancellation reaches I/O', async () => {
  for (const reply of [new Response('SECRET', {status:401}), new Response('SECRET', {status:302,headers:{Location:'https://untrusted.example'}}), new Response('SECRET'), Response.json({data:[]}), Response.json({no:'models'})]) {
    await assert.rejects(listLocalModels({ type:'ollama', baseUrl:'http://localhost:11434/v1', fetchImpl:async()=>reply }), e=>!e.message.includes('SECRET'));
  }
  await assert.rejects(readProviderJSON(new Response('x'.repeat(100)), 10), /size limit/);
  const stop = new AbortController();
  await assert.rejects(listLocalModels({type:'ollama',baseUrl:'http://localhost:11434/v1',signal:stop.signal,fetchImpl:async(_,options)=>{
    stop.abort(); assert.equal(options.signal.aborted, true); options.signal.throwIfAborted();
  }}), {name:'AbortError'});
});
