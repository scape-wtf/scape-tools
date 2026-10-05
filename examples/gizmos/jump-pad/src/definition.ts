/** Jump pad demonstrates a directional offset destination without linking or Portal artwork. */
import { defineObject, exactKeys, record } from '@scape-wtf/sdk';

export const jumpPad = defineObject<Record<string, never>>({
  type: 'examples.jump-pad',
  version: 1,
  emoji: '⏩',
  label: 'Jump pad',
  hint: 'Walk into this pad to jump four cells east',
  initial: () => ({}),
  valid: (state): state is Record<string, never> => record(state) && exactKeys(state, []),
  actions: {},
  walkable: true,
  travel: () => ({
    destination: { kind: 'offset', x: 4, y: 0 },
    exits: [[0, 0]],
    cooldownMs: 650,
    arrival: { durationMs: 180, scale: 0.7 },
  }),
});

export default jumpPad;
