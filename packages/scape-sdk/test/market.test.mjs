import assert from 'node:assert/strict';
import test from 'node:test';
import { defineObject, record, validGizmoMarketToken } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';
const token = {
  address: 'So11111111111111111111111111111111111111112',
  symbol: 'SOL',
  name: 'Wrapped SOL',
};
const definition = defineObject({
  type: 'test.market',
  version: 1,
  emoji: '📈',
  label: 'Market',
  hint: '',
  initial: () => ({ token: null }),
  valid: record,
  market: { kind: 'solana-token', field: 'token', action: 'select' },
  actions: { select: { permission: 'editor', run: (_s, p) => p } },
});
const context = { actorId: 'owner', canEdit: true, now: 0, randomInt: () => 0 };
test('market capability validates declarations and denies arbitrary providers, URLs and participant writes', () => {
  assert.equal(validGizmoMarketToken(token), true);
  for (const bad of [
    { ...token, address: 'https://example.com' },
    { ...token, name: 'a\nline' },
    { ...token, symbol: 'a'.repeat(25) },
    { ...token, url: 'https://example.com' },
  ])
    assert.equal(validGizmoMarketToken(bad), false);
  for (const patch of [
    { market: { ...definition.market, kind: 'url' } },
    { market: { ...definition.market, url: 'https://example.com' } },
    { actions: { select: { permission: 'participant', run: (_s, p) => p } } },
    { initial: () => ({ token: 'SOL' }) },
    { web: { title: 'test', url: 'https://example.com' } },
  ])
    assert.throws(() => new ObjectRegistry([{ ...definition, ...patch }]));
});
test('untrusted imports, action results and configuration retain stable token identity', () => {
  const registry = new ObjectRegistry([definition]),
    instance = registry.create('📈', 'market-instance-one');
  assert.equal(registry.validate({ ...instance, state: { token: 'SOL' } }), false);
  assert.throws(() =>
    registry.act(instance, { name: 'select', payload: { token } }, { ...context, canEdit: false }),
  );
  assert.throws(() =>
    registry.act(
      instance,
      { name: 'select', payload: { token: { ...token, address: '../bad' } } },
      context,
    ),
  );
  assert.deepEqual(registry.act(instance, { name: 'select', payload: { token } }, context).state, {
    token,
  });
});

test('optional display field is bounded and old token-only state remains readable', () => {
  const registry = new ObjectRegistry([
    { ...definition, market: { ...definition.market, displayField: 'display' } },
  ]);
  const item = registry.create('📈', 'market-display-test');
  for (const display of ['label', 'card', undefined])
    assert.equal(
      registry.validate({ ...item, state: { token, ...(display ? { display } : {}) } }),
      true,
    );
  assert.equal(registry.validate({ ...item, state: { token, display: 'iframe' } }), false);
  for (const displayField of ['token', '../display', 1])
    assert.throws(
      () => new ObjectRegistry([{ ...definition, market: { ...definition.market, displayField } }]),
    );
});
