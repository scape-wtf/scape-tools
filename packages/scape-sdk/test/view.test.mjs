import assert from 'node:assert/strict';
import test from 'node:test';
import { validObjectView } from '../dist/index.js';

const view = () => ({
  title: 'Choices',
  description: '',
  fields: [
    {
      id: 'style',
      label: 'Style',
      kind: 'select',
      value: 'soft',
      options: [
        { value: 'soft', label: 'Soft' },
        { value: 'hard', label: 'Hard' },
      ],
    },
  ],
  controls: [
    { id: 'save', label: 'Save', fields: ['style'], action: { name: 'save', payload: {} } },
  ],
});

test('bounded choice fields validate values, uniqueness, references and text compatibility', () => {
  assert.equal(validObjectView(view()), true);
  const text = view();
  text.fields = [{ id: 'style', label: 'Style', value: 'Soft', maxLength: 30 }];
  assert.equal(validObjectView(text), true);
  for (const change of [
    field => (field.options = []),
    field =>
      (field.options = Array.from({ length: 65 }, (_, n) => ({
        value: String(n),
        label: String(n),
      }))),
    field => field.options.push({ value: 'soft', label: 'Duplicate' }),
    field => (field.options[0].value = ''),
    field => (field.options[0].value = 'x'.repeat(129)),
    field => (field.options[0].label = 'x'.repeat(241)),
    field => (field.options[0].label = null),
    field => (field.options[0].callback = 'execute'),
    field => (field.value = 'unlisted'),
    field => (field.kind = 'dropdown'),
    field => (field.maxLength = 5),
  ]) {
    const invalid = view();
    change(invalid.fields[0]);
    assert.equal(validObjectView(invalid), false, String(change));
  }
  const invalid = view();
  invalid.controls[0].fields.push('missing');
  assert.equal(validObjectView(invalid), false);
});

test('change triggers belong to one bounded select form without confirmation or icon actions', () => {
  const automatic = view();
  automatic.controls[0].trigger = 'change';
  assert.equal(validObjectView(automatic), true);
  for (const mutate of [
    value => (value.controls[0].trigger = 'input'),
    value => (value.controls[0].confirm = 'Sure?'),
    value => (value.controls[0].fields = []),
    value => value.controls.push({ ...value.controls[0], id: 'second-save' }),
    value => (value.fields[0] = { id: 'style', label: 'Style', value: 'Soft', maxLength: 30 }),
  ]) {
    const invalid = structuredClone(automatic);
    mutate(invalid);
    assert.equal(validObjectView(invalid), false, String(mutate));
  }
});

test('sparse fields, options and controls do not pass view validation', () => {
  for (const change of [
    value => (value.fields = new Array(1)),
    value => (value.fields[0].options = new Array(1)),
    value => (value.controls = new Array(1)),
  ]) {
    const invalid = view();
    change(invalid);
    assert.equal(validObjectView(invalid), false);
  }
});

test('action-row placement supports ordinary actions and local previews without granting autosave an action button', () => {
  const action = view();
  action.controls[0].placement = 'action';
  assert.equal(validObjectView(action), true);
  action.controls[0].kind = 'preview';
  assert.equal(
    validObjectView(action),
    true,
    'preview fields remain valid with the default action icon',
  );
  for (const placement of ['toolbar', '', true, null]) {
    const invalid = view();
    invalid.controls[0].placement = placement;
    assert.equal(validObjectView(invalid), false);
  }
  action.controls[0].kind = undefined;
  action.controls[0].trigger = 'change';
  assert.equal(validObjectView(action), false);
});
