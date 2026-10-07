import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeLogger } from './runtime-logging.mjs';
import { parseAgentConfig } from './runner-config.mjs';

test('FR-160: logging config defaults to standard and rejects unsupported settings', () => {
  const base = { name: 'Test', provider: { type: 'ollama', model: 'fixture' } };
  assert.deepEqual(parseAgentConfig(base).logging, { level: 'standard', traceReplies: false });
  assert.equal(parseAgentConfig({ ...base, logging: { level: 'debug' } }).logging.level, 'debug');
  for (const logging of [{ level: 'trace' }, { level: 'debug', bodies: true }, true])
    assert.throws(() => parseAgentConfig({ ...base, logging }), /logging/);
});

test('FR-160: diagnostic output excludes arbitrary fields and terminal controls; sink failure is isolated', () => {
  const lines = [];
  const log = createRuntimeLogger({ level: 'debug' }, line => lines.push(line));
  log('reply_review', {
    outcome: 'rejected',
    reason: 'low_confidence',
    threshold: 0.7,
    draft: 'SECRET',
    constructor: 'SECRET',
    apiKey: 'SECRET',
    source: '\x1b[2JSECRET',
    status: 'SECRET',
    durationMs: NaN,
  });
  log('SECRET', { reason: 'SECRET' });
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^\d{4}-\d{2}-\d{2}T.*Z \[debug\] reply_review outcome=rejected reason=low_confidence threshold=0.7$/,
  );
  assert.doesNotMatch(lines[0], /SECRET|\x1b|NaN/);
  assert.doesNotThrow(() =>
    createRuntimeLogger({ level: 'debug' }, () => {
      throw new Error('sink');
    })('runtime'),
  );
});

test('standard mode emits only allowlisted dashboard metadata without printing debug logs', () => {
  const events = [],
    lines = [];
  const diagnostic = createRuntimeLogger(
    { level: 'standard' },
    line => lines.push(line),
    event => events.push(event),
  );
  diagnostic('conversation_request', {
    phase: 'failed',
    status: 429,
    secret: 'PRIVATE_KEY',
    prompt: 'PRIVATE_DIALOGUE',
  });
  assert.deepEqual(events, [
    { type: 'diagnostic', event: 'conversation_request', phase: 'failed', status: 429 },
  ]);
  assert.deepEqual(lines, []);
});
