/** Calendar values remain separate; this example never converts them to a timestamp. */
import {
  defineObject,
  exactKeys,
  ObjectActionError,
  record,
  validObjectFieldValue,
  type ObjectField,
  type ObjectViewRow,
} from '@scape-wtf/sdk';
export interface EventState {
  // Optional additions keep earlier placements readable without rewriting saved state.
  name?: string;
  duration?: number;
  format?: string;
  activities?: string[];
  date: string;
  time: string;
  timezone: string;
  color: string;
  capacity: number;
  open: boolean;
  notes: string;
}
const addedDefaults = { name: '', duration: 60, format: 'social', activities: [] as string[] };
export const eventFields = (state: EventState): ObjectField[] => [
  {
    id: 'name',
    label: 'Event name',
    kind: 'text',
    value: state.name ?? addedDefaults.name,
    maxLength: 80,
  },
  {
    id: 'date',
    label: 'Date',
    kind: 'date',
    value: state.date,
    min: '2026-01-01',
    max: '2099-12-31',
  },
  { id: 'time', label: 'Time', kind: 'time', value: state.time, min: '00:00', max: '23:59' },
  {
    id: 'timezone',
    label: 'Timezone',
    kind: 'select',
    value: state.timezone,
    options: [
      { value: 'UTC', label: 'UTC' },
      { value: 'America/Edmonton', label: 'America/Edmonton' },
    ],
  },
  {
    id: 'color',
    label: 'Color',
    kind: 'color',
    value: state.color,
    palette: ['#ff8800', '#0099ff', '#44bb66'],
  },
  {
    id: 'capacity',
    label: 'Capacity',
    kind: 'number',
    value: state.capacity,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    id: 'duration',
    label: 'Duration (minutes)',
    kind: 'slider',
    value: state.duration ?? addedDefaults.duration,
    min: 15,
    max: 180,
    step: 15,
  },
  {
    id: 'format',
    label: 'Format',
    kind: 'radio',
    value: state.format ?? addedDefaults.format,
    options: [
      { value: 'social', label: 'Social' },
      { value: 'workshop', label: 'Workshop' },
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    kind: 'checklist',
    value: state.activities ?? [],
    options: [
      { value: 'music', label: 'Music' },
      { value: 'games', label: 'Games' },
      { value: 'tour', label: 'World tour' },
    ],
  },
  { id: 'open', label: 'Open to visitors', kind: 'boolean', value: state.open },
  {
    id: 'notes',
    label: 'Notes',
    kind: 'text',
    value: state.notes,
    maxLength: 1000,
    multiline: true,
  },
];
const initial = (): EventState => ({
  ...addedDefaults,
  activities: [],
  date: '',
  time: '',
  timezone: 'UTC',
  color: '#0099ff',
  capacity: 10,
  open: true,
  notes: '',
});
const valid = (state: unknown): state is EventState => {
  if (
    !record(state) ||
    !exactKeys(state, [
      'name',
      'date',
      'time',
      'timezone',
      'color',
      'capacity',
      'open',
      'notes',
      'duration',
      'format',
      'activities',
    ])
  )
    return false;
  const values: Record<string, unknown> = { ...addedDefaults, ...state };
  return eventFields(initial()).every(field => validObjectFieldValue(field, values[field.id]));
};
export const eventForm = defineObject<EventState>({
  type: 'scape.event-form',
  version: 1,
  emoji: '📝',
  label: 'Event form',
  hint: 'Plan a gathering',
  initial,
  valid,
  actions: {
    save: {
      permission: 'editor',
      run: (_state, payload) => {
        if (!valid(payload) || !payload.date || !payload.time)
          throw new ObjectActionError(400, 'Choose a date and time and check the event details');
        return { ...addedDefaults, ...payload, activities: [...(payload.activities ?? [])] };
      },
    },
  },
  view: (state, viewer) => ({
    title: state.name || 'Event form',
    description: state.date
      ? `${state.date} · ${state.time} (${state.timezone})`
      : 'Choose a calendar date, local time and explicit timezone.',
    items: state.notes
      ? [
          {
            id: 'notes',
            title: state.open ? 'Visitors welcome' : 'Private gathering',
            description: state.notes,
          },
        ]
      : [],
    rows: [
      ...(state.notes
        ? [
            {
              id: 'summary',
              label: 'Event details',
              elements: [{ kind: 'description' }, { kind: 'item', id: 'notes' }],
            } satisfies ObjectViewRow,
          ]
        : []),
      ...(viewer.canEdit
        ? ([
            { id: 'name', elements: [{ kind: 'field', id: 'name' }] },
            {
              id: 'when',
              label: 'Date and time',
              elements: [
                { kind: 'field', id: 'date' },
                { kind: 'field', id: 'time' },
              ],
            },
            { id: 'timezone', elements: [{ kind: 'field', id: 'timezone' }] },
            { id: 'color', elements: [{ kind: 'field', id: 'color' }] },
            {
              id: 'attendance',
              label: 'Attendance',
              elements: [
                { kind: 'field', id: 'capacity' },
                { kind: 'field', id: 'open' },
              ],
            },
            ...['duration', 'format', 'activities'].map(id => ({
              id,
              elements: [{ kind: 'field' as const, id }],
            })),
            {
              id: 'save',
              sizing: 'content',
              elements: [
                { kind: 'field', id: 'notes' },
                { kind: 'control', id: 'save' },
              ],
            },
          ] satisfies ObjectViewRow[])
        : []),
    ],
    fields: viewer.canEdit ? eventFields(state) : [],
    controls: viewer.canEdit
      ? [
          {
            id: 'save',
            label: 'Save event',
            fields: eventFields(state).map(field => field.id),
            action: { name: 'save', payload: {} },
          },
        ]
      : [],
  }),
});
