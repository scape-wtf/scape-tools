import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectActionError } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { votingBooth } from '../dist/definition.js';

const registry = new ObjectRegistry([votingBooth]);
const create = () => registry.create('🗳️', 'starter-instance-0001');
const context = (actorId = 'alice', canEdit = false) => ({
  actorId,
  canEdit,
  now: 1_000,
  randomInt: () => {
    throw new Error('The booth needs no randomness');
  },
});
const vote = (instance, choice, actor = 'alice') =>
  registry.act(
    instance,
    {
      name: 'vote',
      payload: { round: instance.state.round, choice },
    },
    context(actor),
  );
const rejected = status => error => error instanceof ObjectActionError && error.status === status;

test('votes are changeable, isolated, serializable and reflected in declarative controls', () => {
  const original = create();
  let booth = vote(original, 0);
  booth = vote(booth, 1);
  booth = vote(booth, 0, 'bob');
  assert.deepEqual(original.state.ballots, []);
  assert.deepEqual(booth.state.ballots, [
    { voter: 'alice', choice: 1 },
    { voter: 'bob', choice: 0 },
  ]);
  assert.deepEqual(create().state.ballots, []);
  const restored = JSON.parse(JSON.stringify(booth));
  assert.equal(registry.validate(restored), true);
  const view = votingBooth.view(restored.state, context());
  assert.equal(view.controls.find(c => c.id === 'vote-1').pressed, true);
  assert.equal(
    view.controls.some(c => c.id === 'reset'),
    false,
  );
  assert.equal(
    votingBooth.view(restored.state, context('alice', true)).controls.find(c => c.id === 'reset')
      .confirm,
    'Clear all votes?',
  );
});

test('editor actions and stale submissions are checked by the runtime', () => {
  let booth = create();
  const toggle = { name: 'toggle', payload: { round: 0 } };
  assert.throws(() => registry.act(booth, toggle, context()), rejected(403));
  booth = registry.act(booth, toggle, context('alice', true));
  assert.throws(
    () => registry.act(booth, { name: 'vote', payload: { round: 0, choice: 0 } }, context()),
    rejected(409),
  );
  assert.throws(() => vote(booth, 0), rejected(409));
  assert.throws(
    () => registry.act(booth, { name: 'reset', payload: { round: 1 } }, context()),
    rejected(403),
  );
  booth = registry.act(booth, { name: 'reset', payload: { round: 1 } }, context('alice', true));
  assert.equal(vote(booth, 1).state.ballots.length, 1);
});

test('invalid payloads, state versions and oversized input cannot alter saved state', () => {
  const booth = create();
  assert.throws(() => vote(booth, 99), rejected(400));
  assert.throws(
    () =>
      registry.act(
        booth,
        {
          name: 'vote',
          payload: {
            round: 0,
            choice: 1,
            extra: true,
          },
        },
        context(),
      ),
    rejected(400),
  );
  assert.throws(
    () =>
      registry.act(
        booth,
        { name: 'vote', payload: { round: 0, choice: 'x'.repeat(2049) } },
        context(),
      ),
    rejected(400),
  );
  assert.equal(registry.validate({ ...booth, version: 2 }), false);
  assert.equal(
    registry.validate({
      ...booth,
      state: { ...booth.state, ballots: [{ voter: 'alice', choice: 99 }] },
    }),
    false,
  );
  assert.deepEqual(booth.state.ballots, []);
});
