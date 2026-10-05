/** pressure-pad: SDK definition and authored behavior. Scape supplies the host services. */
import { defineObject, exactKeys, record } from '@scape-wtf/sdk';

/** Arrival feedback is temporary: there is no saved counter or permission-bearing action. */
export const pressurePad = defineObject<Record<string, never>>({
  type: 'example.pressure-pad',
  version: 1,
  emoji: '🔘',
  label: 'Pressure pad',
  hint: 'walk or ride onto the pad to light it and play a note',
  initial: () => ({}),
  valid: (state): state is Record<string, never> => record(state) && exactKeys(state, []),
  actions: {},
  walkable: true,
  sounds: {
    note: {
      kind: 'synth',
      duration: 0.35,
      voices: [
        {
          wave: 'sine',
          start: 0,
          duration: 0.3,
          frequency: 523.25,
          gain: 0.2,
        },
        {
          wave: 'sine',
          start: 0,
          duration: 0.2,
          frequency: 1046.5,
          gain: 0.06,
        },
      ],
    },
  },
  // Scape supplies one arrival per observed move. Standing still does not repeat it.
  step: (_state, event) => ({
    durationMs: 600,
    lighting: {
      light: {
        color: event.movement === 'push' ? '#a28aff' : '#6bdfff',
        radiusCells: 2,
        intensity: 0.16,
        basementIntensity: 0.25,
        illumination: 0.6,
      },
      glow: {
        color: '#6bdfff',
        size: 65,
        pulse: {
          speed: 0,
          amount: 0,
          phaseX: 0,
        },
        opacity: {
          base: 0.3,
          amount: 0,
          speed: 0,
          phaseY: 0,
        },
      },
    },
    audio: [
      {
        kind: 'play',
        voice: 'note',
        sound: 'note',
        delayMs: 0,
        gain: 0.6,
        rate: 1,
        loop: false,
        rangeCells: [1, 8],
        stereo: 0.7,
      },
    ],
  }),
});
export default pressurePad;
