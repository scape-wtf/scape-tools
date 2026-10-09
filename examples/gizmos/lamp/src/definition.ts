/** A standalone SDK lamp. The package chooses the light; Scape renders it. */
import { defineObject, exactKeys, record, requirePayload, ObjectActionError } from '@scape-wtf/sdk';

const colors = {
  warm: '#ffc078',
  blue: '#6baaff',
  pink: '#ff80ba',
} as const;
type Color = keyof typeof colors;
/** Shared, saved state; each placed lamp has its own switch and color. */
export interface LampState {
  on: boolean;
  color: Color;
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
    typeof state.color === 'string' &&
    Object.prototype.hasOwnProperty.call(colors, state.color),
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
        if (
          typeof payload.color !== 'string' ||
          !Object.prototype.hasOwnProperty.call(colors, payload.color)
        ) {
          throw new ObjectActionError(400, 'Choose a lamp color.');
        }
        return { ...state, color: payload.color as Color };
      },
    },
  },
  view: (state, viewer) => ({
    title: 'Lamp',
    description: '',
    controls: [
      {
        id: 'toggle',
        icon: 'toggle',
        label: state.on ? 'Turn off' : 'Turn on',
        pressed: state.on,
        action: { name: 'toggle', payload: {} },
      },
      ...Object.keys(colors).map(color => ({
        id: color,
        label: color[0].toUpperCase() + color.slice(1),
        pressed: state.color === color,
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
            color: colors[state.color],
            intensity: 0.12,
            basementIntensity: 0.25,
            illumination: 0.7,
          },
          glow: {
            color: colors[state.color],
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
