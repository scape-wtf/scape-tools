/** Chime owns the bump action and ring recipe; Scape supplies shared delivery and output. */
import {
  defineObject,
  record,
  requirePayload,
  type GizmoInteractionFeedback,
} from '@scape-wtf/sdk';

const ringFeedback: GizmoInteractionFeedback = {
  durationMs: 600,
  audioMode: 'replace',
  burstMode: 'replace',
  burst: {
    color: '#a9e8ff',
    radiusCells: 1.5,
    particles: 0,
  },
  audio: [
    {
      kind: 'play',
      voice: 'ring',
      delayMs: 0,
      sound: 'ring',
      gain: 1,
      rate: 1,
      loop: false,
      rangeCells: [1, 8],
      stereo: 0.7,
    },
  ],
};

/** Chime supplies a signal recipe; Scape supplies shared delivery and output. */
export const chime = defineObject<{ lastAt: number }>({
  type: 'examples.chime',
  version: 1,
  emoji: '🛎️',
  label: 'Chime',
  hint: 'Bump to ring for nearby players',
  interaction: { bump: { name: 'ring', payload: {} } },
  interactionFeedback: { ring: ringFeedback },
  initial: () => ({ lastAt: 0 }),
  valid: (state): state is { lastAt: number } =>
    record(state) &&
    Object.keys(state).length === 1 &&
    Number.isSafeInteger(state.lastAt) &&
    Number(state.lastAt) >= 0,
  actions: {
    ring: {
      permission: 'participant',
      run: (_state, payload, context) => {
        requirePayload(payload, []);
        return { lastAt: context.now };
      },
    },
  },
  sounds: {
    ring: {
      kind: 'synth',
      duration: 0.6,
      voices: [
        {
          wave: 'sine',
          start: 0,
          duration: 0.55,
          frequency: 880,
          gain: [
            { time: 0, value: 0 },
            { time: 0.005, value: 0.2 },
            { time: 0.55, value: 0 },
          ],
        },
      ],
    },
  },
  // Saved timestamps retain compatibility. Other players hear the accepted ring.
  react: () => ({
    feedback: {
      ...ringFeedback,
    },
  }),
});

export default chime;
