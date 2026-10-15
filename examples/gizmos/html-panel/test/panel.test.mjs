import assert from 'node:assert/strict';
import test from 'node:test';
import { validObjectView } from '@scape-wtf/sdk';
import { ObjectRegistry } from '@scape-wtf/sdk/runtime';
import { htmlPanel } from '../dist/definition.js';
const viewer = { actorId: 'player', canEdit: false, now: 0, randomInt: () => 0 };
const submit = (state, code) => htmlPanel.actions.submit.run(state, { code }, viewer);

test('only a validated solution powers the terminal; reset releases its output', () => {
  const initial = htmlPanel.initial();
  assert.deepEqual(htmlPanel.signals(initial, initial, null), { solved: false });
  const wrong = submit(initial, '0000');
  assert.equal(wrong.solved, false);
  const solved = submit(wrong, '3142');
  assert.deepEqual(htmlPanel.signals(solved, wrong, null), { solved: true });
  assert.deepEqual(submit(solved, '0000'), solved, 'another visitor cannot unsolve it');
  const reset = htmlPanel.actions.reset.run(solved, {}, viewer);
  assert.deepEqual(htmlPanel.signals(reset, solved, null), { solved: false });
  assert.equal(htmlPanel.actions.reset.permission, 'editor');
  assert.equal(htmlPanel.actions.submit.permission, 'participant');
  assert.deepEqual(htmlPanel.web.actions, ['submit'], 'HTML cannot reset or edit wiring');
  assert.equal(htmlPanel.view(solved, viewer).controls.length, 0);
  assert.equal(
    htmlPanel.view(solved, { ...viewer, canEdit: true }).controls[0].action.name,
    'reset',
  );
});

test('forged solutions, malformed codes and invalid saved state are rejected', () => {
  for (const code of [3142, null, {}, '314', '31420', '３１４２', ' 3142', 'abcd'])
    assert.throws(() => submit(htmlPanel.initial(), code));
  assert.throws(() =>
    htmlPanel.actions.submit.run(htmlPanel.initial(), { code: '3142', solved: true }, viewer),
  );
  assert.throws(() => htmlPanel.actions.reset.run(htmlPanel.initial(), { solved: true }, viewer));
  for (const state of [
    { count: -1 },
    { count: 1, solved: 'yes' },
    { count: 1, other: true },
    { count: Infinity },
  ])
    assert.equal(htmlPanel.valid(state), false);
  assert.equal(submit({ count: 999999, solved: false }, '0000').count, 999999);
});

test('existing HTML counters remain readable and public data never contains the answer', () => {
  const legacy = { count: 17 };
  assert.equal(htmlPanel.valid(legacy), true);
  assert.deepEqual(htmlPanel.signals(legacy, legacy, null), { solved: false });
  assert.equal(submit(legacy, '3142').solved, true);
  for (const state of [legacy, htmlPanel.initial(), submit(legacy, '3142')]) {
    const view = htmlPanel.view(state, viewer);
    assert.equal(validObjectView(view), true);
    assert.deepEqual(view.webData, { solved: state.solved === true });
    assert.equal(Object.hasOwn(view, 'web'), false);
  }
  new ObjectRegistry([htmlPanel]); // Validate the complete web/connection contract together.
  assert.equal(htmlPanel.web.interactive, true);
  assert.ok(htmlPanel.web.html.length <= 16384);
});
