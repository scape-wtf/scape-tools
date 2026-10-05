/** This tile declares walkability; Scape supplies collision, movement and placement. */
import { defineObject, exactKeys, record } from '@scape-wtf/sdk';

/** Walkability is independent: this tile has no actions, arrival effects or push. */
export const walkableTile = defineObject<Record<string, never>>({
  type: 'example.walkable-tile',
  version: 1,
  emoji: '🟦',
  label: 'Walkable tile',
  hint: 'a floor tile with no movement or arrival effects',
  initial: () => ({}),
  valid: (state): state is Record<string, never> => record(state) && exactKeys(state, []),
  actions: {},
  walkable: true,
});
