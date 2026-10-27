import assert from 'node:assert/strict';
import test from 'node:test';
import { validObjectView, validObjectFieldValue } from '../dist/index.js';
const wrap = field => ({
  title: '',
  description: '',
  fields: [{ id: 'value', label: 'Value', ...field }],
  controls: [
    { id: 'save', label: 'Save', fields: ['value'], action: { name: 'save', payload: {} } },
  ],
});
const samples = [
  { kind: 'date', value: '2028-02-29', min: '2026-01-01', max: '2099-12-31' },
  { kind: 'time', value: '23:59', min: '00:00', max: '23:59' },
  { kind: 'color', value: '#aabbcc', palette: ['#aabbcc', '#000000'] },
  { kind: 'number', value: 0.3, min: 0.1, max: 10, step: 0.1 },
  { kind: 'boolean', value: false },
  { kind: 'text', value: 'Hello\n🌱', multiline: true, maxLength: 100 },
];
test('native fields accept bounded declarative data and preserve legacy text/select', () => {
  const picker = wrap({ kind: 'emoji', value: '🔳' });
  picker.controls[0].trigger = 'change';
  assert.equal(validObjectView(picker), true);
  for (const value of ['', 'hello', '🌷🌻', null, 4]) {
    assert.equal(validObjectView(wrap({ kind: 'emoji', value })), false);
  }
  assert.equal(
    validObjectView(wrap({ kind: 'emoji', value: '🔳', options: ['🌷'] })),
    false,
    'authors cannot replace the host palette',
  );
  for (const field of samples) assert.equal(validObjectView(wrap(field)), true, field.kind);
  assert.equal(validObjectView(wrap({ value: 'legacy', maxLength: 30 })), true);
  assert.equal(
    validObjectView(wrap({ kind: 'select', value: 'x', options: [{ value: 'x', label: 'X' }] })),
    true,
  );
  for (const field of samples.filter(field => field.kind !== 'text')) {
    const view = wrap(field);
    view.controls[0].trigger = 'change';
    assert.equal(validObjectView(view), true);
  }
});
test('native field schemas reject malformed bounds, values, extra keys and oversized palettes', () => {
  const invalid = [
    { ...samples[0], value: '2027-02-29' },
    { ...samples[0], value: '2028-02-30' },
    { ...samples[0], min: '0000-01-01' },
    { ...samples[0], value: '2028-2-01' },
    { ...samples[0], min: '2099-12-31', max: '2026-01-01' },
    { ...samples[1], value: '24:00' },
    { ...samples[1], value: '12:00Z' },
    { ...samples[1], min: '12:00', max: '11:00' },
    { ...samples[2], value: 'red' },
    { ...samples[2], palette: ['#000000', '#000000'] },
    { ...samples[2], palette: Array(33).fill('#000000') },
    { ...samples[2], palette: [] },
    { ...samples[2], palette: Array(2) },
    ...[NaN, Infinity, '3', null, 0.35, 11].map(value => ({ ...samples[3], value })),
    ...[0, -1, Infinity, '1'].map(step => ({ ...samples[3], step })),
    { ...samples[3], min: 20 },
    { ...samples[4], value: 'false' },
    { ...samples[5], multiline: 'true' },
    ...samples.map(field => ({ ...field, html: '<input>' })),
  ];
  for (const field of invalid)
    assert.equal(validObjectView(wrap(field)), false, JSON.stringify(field));
});
test('submission validates exact types, dates, decimal steps and text lengths independently of views', () => {
  for (const field of samples) assert.equal(validObjectFieldValue(field, field.value), true);
  assert.equal(validObjectFieldValue(samples[3], '0.3'), false);
  assert.equal(validObjectFieldValue(samples[3], 0.30000000000000004), true);
  assert.equal(validObjectFieldValue(samples[4], 'true'), false);
  assert.equal(validObjectFieldValue(samples[5], 'x'.repeat(101)), false);
  assert.equal(validObjectFieldValue(samples[0], ''), true);
  assert.equal(validObjectFieldValue(samples[1], ''), true);
  assert.equal(validObjectFieldValue(samples[2], '#123456'), true, 'palette is a suggestion');
});

for (const kind of ['slider', 'radio', 'checklist']) {
  test(`${kind} validates typed values, bounds and option identity`, () => {
    const field =
      kind === 'slider'
        ? { kind, value: 0.3, min: 0.1, max: 1, step: 0.1 }
        : {
            kind,
            value: kind === 'radio' ? 'one' : ['one'],
            options: [
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
            ],
          };
    assert.ok(validObjectView(wrap(field)));
    const automatic = wrap(field);
    automatic.controls[0].trigger = 'change';
    assert.ok(validObjectView(automatic));
    const invalid =
      kind === 'slider'
        ? ['0.3', NaN, Infinity, 0.35, 2]
        : kind === 'radio'
          ? ['', 'missing', ['one']]
          : ['one', ['missing'], ['one', 'one'], Array(1), [null]];
    for (const value of invalid) {
      assert.equal(validObjectFieldValue(field, value), false);
      assert.equal(validObjectView(wrap({ ...field, value })), false);
    }
    if (kind === 'slider') {
      for (const change of [{ step: 0 }, { step: -1 }, { min: 2 }, { max: Infinity }])
        assert.equal(validObjectView(wrap({ ...field, ...change })), false);
    } else {
      for (const options of [
        [],
        Array(2),
        [field.options[0], field.options[0]],
        Array(65).fill(field.options[0]),
      ])
        assert.equal(validObjectView(wrap({ ...field, options })), false);
    }
    if (kind === 'checklist') assert.ok(validObjectFieldValue(field, []));
  });
}
