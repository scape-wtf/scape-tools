/** A standalone SDK lamp. The package chooses the light; Scape renders it. */
import { defineObject, exactKeys, record, requirePayload, ObjectActionError } from '@scape-wtf/sdk';

const colors = {
  warm: '#ffc078',
  blue: '#6baaff',
  pink: '#ff80ba',
} as const;
type Color = keyof typeof colors;
const validColor = (value: unknown): value is string =>
  typeof value === 'string' &&
  (Object.prototype.hasOwnProperty.call(colors, value) || /^#[0-9a-f]{6}$/.test(value));
const lightColor = (color: string): string => colors[color as Color] ?? color;
/** Shared, saved state; each placed lamp has its own switch and color. */
export interface LampState {
  on: boolean;
  /** Existing preset names or a lowercase six-digit hex color. */
  color: string;
}

export const lamp = defineObject<LampState>({
  type: 'example.lamp',
  version: 1,
  emoji: '🏮',
  label: 'Lamp',
  hint: 'switch the light on or choose a color',
  initial: () => ({ on: true, color: 'warm' }),
  valid: (state): state is LampState =>
    record(state) &&
    exactKeys(state, ['on', 'color']) &&
    typeof state.on === 'boolean' &&
    validColor(state.color),
  inputs: {
    toggle: { label: 'Toggle', phrase: 'toggle', kind: 'event', action: 'toggle' },
    on: {
      label: 'Turn on',
      phrase: 'turn on',
      kind: 'event',
      action: 'power',
      payload: { on: true },
    },
    off: {
      label: 'Turn off',
      phrase: 'turn off',
      kind: 'event',
      action: 'power',
      payload: { on: false },
    },
    power: {
      label: 'Power',
      kind: 'boolean',
      action: 'power',
      value: 'on',
      combine: 'any',
      locks: ['toggle', 'power'],
    },
  },
  outputs: { power: { label: 'Power', kind: 'boolean' } },
  signals: state => ({ power: state.on }),
  actions: {
    power: {
      permission: 'participant',
      run: (state, payload) => {
        requirePayload(payload, ['on']);
        if (typeof payload.on !== 'boolean') throw new ObjectActionError(400, 'Choose on or off.');
        return { ...state, on: payload.on };
      },
    },
    toggle: {
      permission: 'participant',
      run: (state, payload) => {
        requirePayload(payload, []);
        return { ...state, on: !state.on };
      },
    },
    color: {
      permission: 'editor',
      run: (state, payload) => {
        requirePayload(payload, ['color']);
        if (!validColor(payload.color)) {
          throw new ObjectActionError(400, 'Choose a lamp color.');
        }
        const preset = (Object.keys(colors) as Color[]).find(key => colors[key] === payload.color);
        return { ...state, color: preset ?? payload.color };
      },
    },
  },
  view: (state, viewer) => ({
    title: 'Lamp',
    description: '',
    rows: viewer.canEdit
      ? [
          {
            id: 'color',
            label: 'Lamp color',
            sizing: 'content',
            elements: [
              { kind: 'field', id: 'color' },
              { kind: 'control', id: 'warm' },
              { kind: 'control', id: 'blue' },
              { kind: 'control', id: 'pink' },
            ],
          },
        ]
      : [],
    fields: viewer.canEdit
      ? [{ id: 'color', label: 'Custom color', kind: 'color', value: lightColor(state.color) }]
      : [],
    controls: [
      {
        id: 'toggle',
        icon: 'toggle',
        label: state.on ? 'Turn off' : 'Turn on',
        pressed: state.on,
        action: { name: 'toggle', payload: {} },
      },
      ...(viewer.canEdit
        ? [
            {
              id: 'custom-color',
              label: 'Set custom color',
              fields: ['color'],
              trigger: 'change' as const,
              action: { name: 'color', payload: {} },
            },
          ]
        : []),
      ...Object.keys(colors).map(color => ({
        id: color,
        label: color[0].toUpperCase() + color.slice(1),
        pressed: lightColor(state.color) === colors[color as Color],
        disabled: !viewer.canEdit,
        action: { name: 'color', payload: { color } },
      })),
    ],
  }),
  // Missing effects mean off. This runs on state changes, never once per frame.
  lighting: state =>
    state.on
      ? {
          light: {
            radiusCells: 3,
            color: lightColor(state.color),
            intensity: 0.12,
            basementIntensity: 0.25,
            illumination: 0.7,
          },
          glow: {
            color: lightColor(state.color),
            size: 60,
            pulse: {
              speed: 0,
              amount: 0,
              phaseX: 0,
            },
            opacity: {
              base: 0.2,
              amount: 0,
              speed: 0,
              phaseY: 0,
            },
          },
        }
      : {},
});
export default lamp;
