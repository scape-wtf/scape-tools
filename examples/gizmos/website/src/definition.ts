/** Example only: each developer chooses their own fixed source in the SDK declaration. */
import { defineObject, exactKeys, record } from '@scape-wtf/sdk';
import { flooredIconPng } from './icon.js';

export const website = defineObject<Record<string, never>>({
  type: 'scape.website',
  version: 1,
  emoji: '🌐',
  label: 'floored',
  hint: 'open floored in an embedded website',
  initial: () => ({}),
  valid: (state): state is Record<string, never> => record(state) && exactKeys(state, []),
  actions: {},
  sprite: () => ({
    size: 192,
    layers: [
      {
        id: 'icon',
        shapes: [{ kind: 'image', x: 0, y: 0, width: 192, height: 192, png: flooredIconPng }],
      },
    ],
  }),
  web: { title: 'floored', url: 'https://floored.app/' },
});
