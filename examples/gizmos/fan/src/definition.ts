/** A switchable floor fan: state selects a push; Scape handles each player's movement. */
import {
  defineObject,
  exactKeys,
  record,
  requirePayload,
  ObjectActionError,
  type GizmoPush,
} from '@scape-wtf/sdk';

const directions = ['right', 'down', 'left', 'up'] as const;
export interface FanState {
  on: boolean;
  direction: GizmoPush['direction'];
}
export const fan = defineObject<FanState>({
  type: 'example.fan',
  version: 1,
  emoji: '🪭',
  label: 'Floor fan',
  hint: 'step onto the fan to get pushed; choose its direction in Configure',
  initial: () => ({ on: true, direction: 'right' }),
  valid: (state): state is FanState =>
    record(state) &&
    exactKeys(state, ['on', 'direction']) &&
    typeof state.on === 'boolean' &&
    directions.some((direction) => direction === state.direction),
  walkable: true,
  // No step callback is needed. Returning null stops pushing without changing walkability.
  // Opposing input stays allowed, unlike the conveyor's one-way surface.
  push: (state) => (state.on ? { direction: state.direction } : null),
  actions: {
    toggle: {
      permission: 'participant',
      run: (state, payload) => {
        requirePayload(payload, []);
        return { ...state, on: !state.on };
      },
    },
    direction: {
      permission: 'editor',
      run: (state, payload) => {
        requirePayload(payload, ['direction']);
        if (!directions.some((direction) => direction === payload.direction))
          throw new ObjectActionError(400, 'Choose a direction.');
        return { ...state, direction: payload.direction as FanState['direction'] };
      },
    },
  },
  view: (state, viewer) => ({
    title: 'Floor fan',
    description: '',
    fields: [
      {
        id: 'direction',
        label: 'Direction',
        kind: 'select',
        value: state.direction,
        options: directions.map((value) => ({
          value,
          label: value[0].toUpperCase() + value.slice(1),
        })),
      },
    ],
    controls: [
      {
        id: 'toggle',
        icon: 'toggle',
        label: state.on ? 'Turn off' : 'Turn on',
        pressed: state.on,
        action: { name: 'toggle', payload: {} },
      },
      {
        id: 'direction',
        label: 'Set direction',
        trigger: 'change',
        fields: ['direction'],
        disabled: !viewer.canEdit,
        action: { name: 'direction', payload: {} },
      },
    ],
  }),
});
export default fan;
