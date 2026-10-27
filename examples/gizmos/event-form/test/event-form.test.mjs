import assert from 'node:assert/strict';
import test from 'node:test';
import { validObjectView } from '@scape-wtf/sdk';
import { eventForm, eventFields } from '../dist/definition.js';
const saved = {
  name: 'Garden gathering',
  duration: 60,
  format: 'social',
  activities: [],
  date: '2028-02-29',
  time: '18:30',
  timezone: 'America/Edmonton',
  color: '#ff8800',
  capacity: 25,
  open: false,
  notes: 'Welcome 🌱\nBring a friend.',
};
test('event form validates typed actions, preserves calendar values, and keeps editing private', () => {
  assert.ok(eventForm.valid(eventForm.initial()));
  for (const canEdit of [true, false])
    assert.ok(validObjectView(eventForm.view(eventForm.initial(), { actorId: 'alice', canEdit })));
  assert.deepEqual(eventForm.actions.save.run(eventForm.initial(), saved), saved);
  assert.equal(eventForm.view(saved, { actorId: 'bob', canEdit: false }).fields.length, 0);
  assert.equal(
    eventForm.view(saved, { actorId: 'bob', canEdit: false }).items[0].description,
    saved.notes,
  );
  assert.equal(eventForm.actions.save.permission, 'editor');
  for (const change of [
    { name: 'x'.repeat(81) },
    { name: null },
    { date: '' },
    { time: '' },
    { date: '2027-02-29' },
    { time: '24:00' },
    { timezone: 'local' },
    { duration: 16 },
    { duration: '60' },
    { format: 'unknown' },
    { activities: ['music', 'music'] },
    { activities: ['unknown'] },
    { activities: 'music' },
    { capacity: '25' },
    { capacity: 101 },
    { capacity: 1.5 },
    { open: 'false' },
    { color: 'blue' },
    { notes: 'x'.repeat(1001) },
    { extra: true },
  ])
    assert.throws(() => eventForm.actions.save.run(saved, { ...saved, ...change }));
});

test('every native form variant is editable and submitted together', () => {
  const view = eventForm.view(saved, { actorId: 'alice', canEdit: true });
  const fields = view.fields;
  assert.ok(fields.some(field => field.kind === 'text' && !field.multiline));
  assert.ok(fields.some(field => field.kind === 'text' && field.multiline));
  for (const kind of [
    'select',
    'date',
    'time',
    'number',
    'boolean',
    'slider',
    'radio',
    'checklist',
  ])
    assert.ok(
      fields.some(field => field.kind === kind),
      kind,
    );
  assert.ok(fields.some(field => field.kind === 'color' && field.palette));
  assert.deepEqual(
    view.controls[0].fields,
    fields.map(field => field.id),
  );
  assert.equal(view.title, saved.name);
  assert.deepEqual(view.rows.find(row => row.id === 'when').elements, [
    { kind: 'field', id: 'date' },
    { kind: 'field', id: 'time' },
  ]);
  assert.ok(validObjectView(view));
  const visitor = eventForm.view(saved, { actorId: 'bob', canEdit: false });
  assert.ok(validObjectView(visitor));
  assert.deepEqual(
    visitor.rows.map(row => row.id),
    ['summary'],
  );
});

test('earlier event placements remain valid and acquire optional defaults only on save', () => {
  const { name, duration, format, activities, ...legacy } = saved;
  const before = structuredClone(legacy);
  assert.ok(eventForm.valid(legacy));
  const fields = eventFields(legacy);
  assert.equal(fields.find(field => field.id === 'name').value, '');
  assert.deepEqual(legacy, before);
  assert.deepEqual(eventForm.actions.save.run(legacy, legacy), {
    name: '',
    duration: 60,
    format: 'social',
    activities: [],
    ...legacy,
  });
});
