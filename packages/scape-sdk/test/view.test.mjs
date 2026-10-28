import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_ICONS,
  ACTION_BUTTON_PRESETS,
  actionButtonIcon,
  validObjectView,
} from '../dist/index.js';

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

test('icon-first buttons accept only approved IDs or presets and explicit confirmation', () => {
  for (const button of [
    ...ACTION_ICONS.map(icon => ({ icon })),
    ...Object.keys(ACTION_BUTTON_PRESETS).map(preset => ({ preset })),
  ]) {
    const value = view();
    Object.assign(value.controls[0], { button, confirm: 'Save changes?' });
    assert.equal(validObjectView(value), true);
    assert.ok(ACTION_ICONS.includes(actionButtonIcon(button)));
  }
  for (const button of [
    {},
    { icon: 'unknown' },
    { icon: '✅' },
    { icon: '/custom.svg' },
    { preset: 'constructor' },
    { preset: 'toString' },
    { preset: 'save', icon: 'check' },
    { icon: 'check', svg: '<svg/>' },
    null,
  ]) {
    const value = view();
    Object.assign(value.controls[0], { button, confirm: 'Save?' });
    assert.equal(validObjectView(value), false, JSON.stringify(button));
  }
  for (const conflict of [
    { confirm: undefined },
    { confirm: ' ' },
    { label: ' ' },
    { placement: 'action' },
    { icon: 'toggle', pressed: true },
    { trigger: 'change' },
    { kind: 'preview' },
    { pressed: false },
  ]) {
    const value = view();
    Object.assign(value.controls[0], { button: { preset: 'save' }, confirm: 'Save?' }, conflict);
    assert.equal(validObjectView(value), false, JSON.stringify(conflict));
  }
});

test('native output rows bound content and reject duplicate IDs, sparse rows and executable metadata', () => {
  const output = () => ({
    title: '',
    description: 'First\nSecond',
    controls: [],
    items: [
      { id: 'note-1', title: 'Alice', description: '<b>Hello</b>\nSecond line' },
      { id: 'note-2', title: 'Anonymous' },
    ],
  });
  assert.equal(validObjectView(output()), true);
  assert.equal(validObjectView({ ...output(), items: [] }), true);
  for (const mutate of [
    v => v.items.push({ ...v.items[0] }),
    v => (v.items[0].title = ' '),
    v => (v.items[0].title = 'x'.repeat(241)),
    v => (v.items[0].description = 'x'.repeat(4097)),
    v => (v.items[0].id = '<script>'),
    v => (v.items[0].html = '<script>bad()</script>'),
    v => (v.items[0].action = { name: 'send' }),
    v => (v.items = new Array(2)),
    v => (v.items = Array.from({ length: 33 }, (_, n) => ({ id: String(n), title: 'Row' }))),
    v =>
      (v.items = Array.from({ length: 5 }, (_, n) => ({
        id: String(n),
        title: 'Row',
        description: 'x'.repeat(4096),
      }))),
  ]) {
    const v = output();
    mutate(v);
    assert.equal(validObjectView(v), false, String(mutate));
  }
});

test('rows compose native elements by reference without duplicating them or accepting arbitrary layouts', () => {
  const base = () => ({
    ...view(),
    items: [{ id: 'status', title: 'Ready' }],
    rows: [
      {
        id: 'summary',
        label: 'Summary',
        elements: [{ kind: 'title' }, { kind: 'description' }, { kind: 'item', id: 'status' }],
      },
      {
        id: 'form',
        sizing: 'content',
        elements: [
          { kind: 'field', id: 'style' },
          { kind: 'control', id: 'save' },
        ],
      },
    ],
  });
  assert.equal(validObjectView(base()), true);
  assert.equal(validObjectView({ ...base(), rows: [] }), true);
  assert.equal(
    validObjectView({
      ...base(),
      rows: [{ id: 'equal', sizing: 'equal', elements: [{ kind: 'field', id: 'style' }] }],
    }),
    true,
  );
  for (const mutate of [
    v => v.rows.push(v.rows[0]),
    v => v.rows[1].elements.push({ kind: 'title' }),
    v => v.rows[1].elements.push({ kind: 'field', id: 'style' }),
    v => (v.rows[1].elements[0].id = 'missing'),
    v => (v.rows[1].elements[1].id = 'missing'),
    v => (v.rows[0].elements[2].id = 'missing'),
    v => (v.rows[0].elements[0].id = 'title'),
    v => (v.rows[0].elements[0].kind = 'iframe'),
    v => (v.rows[1].elements[0].width = 100),
    v => (v.rows[1].elements[0].kind = 'row'),
    v => (v.rows[1].elements = []),
    v => (v.rows[1].elements = new Array(2)),
    v => (v.rows = new Array(2)),
    v => (v.rows[1].elements = Array.from({ length: 9 }, () => ({ kind: 'title' }))),
    v =>
      (v.rows = Array.from({ length: 33 }, (_, i) => ({
        id: `row-${i}`,
        elements: [{ kind: 'title' }],
      }))),
    v => (v.rows[0].id = ''),
    v => (v.rows[0].label = ' '),
    v => (v.rows[0].label = 'x'.repeat(241)),
    v => (v.rows[0].sizing = 'fixed'),
    v => (v.rows[0].style = 'position:fixed'),
    v => (v.controls[0].trigger = 'change'),
  ]) {
    const invalid = base();
    mutate(invalid);
    assert.equal(validObjectView(invalid), false, String(mutate));
  }
});

test('tab toggles require pressed state and no fields, and support editor action-row placement', () => {
  const control = {
    id: 'display',
    label: 'Mini card',
    icon: 'tab',
    placement: 'action',
    pressed: false,
    action: { name: 'display', payload: { display: 'card' } },
  };
  const make = overrides => ({
    title: 'Ticker',
    description: '',
    controls: [{ ...control, ...overrides }],
  });
  assert.equal(validObjectView(make({})), true);
  assert.equal(validObjectView(make({ pressed: true })), true);
  assert.equal(validObjectView(make({ pressed: undefined })), false);
  assert.equal(validObjectView(make({ fields: ['display'] })), false);
  assert.equal(validObjectView(make({ icon: 'arbitrary' })), false);
});
