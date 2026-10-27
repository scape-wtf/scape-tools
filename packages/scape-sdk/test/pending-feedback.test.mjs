import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGizmoPendingFeedback } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';

const recipe = { durationMs: 2000, cycleMs: 500, pulse: { scale: 1.06, rotation: 0 } };
const definition = {
  type: 'test.pending',
  version: 1,
  emoji: '🏮',
  label: 'Lamp',
  hint: 'Toggle',
  initial: () => ({ on: false }),
  valid: state => typeof state.on === 'boolean',
  actions: { toggle: { permission: 'participant', run: state => ({ on: !state.on }) } },
  pendingFeedback: () => recipe,
};
const action = { name: 'toggle', payload: {} };
const context = { now: 1000 };

test('pending feedback is optional, works without a model, and cannot mutate state or actions', () => {
  const state = { on: false };
  const resolved = resolveGizmoPendingFeedback(
    {
      ...definition,
      pendingFeedback: (input, attempted) => {
        input.on = true;
        attempted.payload.changed = true;
        return recipe;
      },
    },
    state,
    action,
    context,
  );
  assert.deepEqual(state, { on: false });
  assert.deepEqual(action.payload, {});
  assert.deepEqual(resolved, recipe);
  resolved.pulse.scale = 1.1;
  assert.equal(recipe.pulse.scale, 1.06);
  assert.equal(
    resolveGizmoPendingFeedback(
      { ...definition, pendingFeedback: undefined },
      state,
      action,
      context,
    ),
    null,
  );
  assert.equal(
    resolveGizmoPendingFeedback(
      { ...definition, pendingFeedback: () => null },
      state,
      action,
      context,
    ),
    null,
  );
});

test('pending cosmetics are bounded and cannot smuggle state, result labels, sounds, or unsupported frames', () => {
  for (const invalid of [
    { ...recipe, durationMs: 5001 },
    { ...recipe, durationMs: NaN },
    { ...recipe, cycleMs: 0 },
    { ...recipe, cycleMs: Infinity },
    { ...recipe, pulse: { scale: 10, rotation: 0 } },
    { ...recipe, pulse: { scale: 1, rotation: 1 } },
    { ...recipe, number: 6 },
    { ...recipe, state: { on: true } },
    { ...recipe, audio: [] },
    { ...recipe, frames: [] },
    { durationMs: 100, cycleMs: 100 },
  ]) {
    assert.throws(() =>
      resolveGizmoPendingFeedback(
        { ...definition, pendingFeedback: () => invalid },
        {},
        action,
        context,
      ),
    );
  }
  assert.throws(() =>
    resolveGizmoPendingFeedback(definition, {}, { name: 'missing', payload: {} }, context),
  );
  assert.throws(() => new ObjectRegistry([{ ...definition, pendingFeedback: {} }]));
});
