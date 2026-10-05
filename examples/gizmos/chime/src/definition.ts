/** Chime owns the ring recipe and cooldown; Scape supplies shared delivery and output. */
import { defineObject, record, requirePayload, ObjectActionError } from '@scape-wtf/sdk';

/** Chime supplies a signal recipe; Scape supplies shared delivery and output. */
export const chime = defineObject<{ lastAt: number }>({
  type: 'examples.chime',
  version: 1,
  emoji: '🛎️',
  label: 'Chime',
  hint: 'Ring for nearby players',
  initial: () => ({ lastAt: 0 }),
  valid: (state): state is { lastAt: number } =>
    record(state) &&
    Object.keys(state).length === 1 &&
    Number.isSafeInteger(state.lastAt) &&
    Number(state.lastAt) >= 0,
  actions: {
    ring: {
      permission: 'participant',
      run: (state, payload, context) => {
        requirePayload(payload, []);
        if (context.now - state.lastAt < 250)
          throw new ObjectActionError(409, 'Let the chime ring');
        return { lastAt: context.now };
      },
    },
  },
  view: () => ({
    title: 'Chime',
    description: '',
    controls: [
      {
        id: 'ring',
        label: 'Ring',
        placement: 'action',
        action: { name: 'ring', payload: {} },
      },
    ],
  }),
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
  // Saved timestamps enforce timing; only this accepted-action result causes playback.
  react: () => ({
    feedback: {
      durationMs: 600,
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
    },
  }),
});

export default chime;
