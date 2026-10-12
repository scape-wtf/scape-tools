/** Jump pad demonstrates a directional offset destination with authored character motion and chained landings. */
import { defineObject, exactKeys, record } from '@scape-wtf/sdk';

export const jumpPad = defineObject<Record<string, never>>({
  type: 'examples.jump-pad',
  version: 1,
  emoji: '⏩',
  label: 'Jump pad',
  hint: 'Step onto this pad to jump four cells east',
  initial: () => ({}),
  valid: (state): state is Record<string, never> => record(state) && exactKeys(state, []),
  actions: {},
  walkable: true,
  travel: () => ({
    destination: { kind: 'offset', x: 4, y: 0 },
    exits: [[0, 0]],
    cooldownMs: 650,
    activateOnArrival: true,
    motion: {
      durationMs: 700,
      // Lift is in cells. Neutral endpoints avoid a snap between consecutive pads.
      frames: [
        { at: 0, offset: [0, 0], scale: [1, 1], rotation: 0 },
        { at: 0.12, offset: [0, 0.15], scale: [0.9, 1.12], rotation: -0.06 },
        { at: 0.5, offset: [0, 1.6], scale: [1, 1], rotation: 0 },
        { at: 0.86, offset: [0, 0.2], scale: [0.94, 1.08], rotation: 0.04 },
        { at: 0.94, offset: [0, 0], scale: [1.12, 0.88], rotation: 0 },
        { at: 1, offset: [0, 0], scale: [1, 1], rotation: 0 },
      ],
    },
  }),
});

export default jumpPad;
