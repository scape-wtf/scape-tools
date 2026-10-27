/** A configurable floor tile. Scape supplies rendering, movement and editing authority. */
import {
  defineObject,
  exactKeys,
  ObjectActionError,
  record,
  requirePayload,
  validObjectFieldValue,
} from '@scape-wtf/sdk';

/** Appearance belongs to each placed tile, independently of its catalog identity. */
export interface WalkableTileState {
  /** Older tiles saved an empty object; missing appearance uses the new default. */
  emoji?: string;
}

// The SDK checks emoji syntax; Scape additionally restricts picker submissions
// to its current game library, without coupling this project to a host catalog.
const validEmoji = (value: unknown): value is string =>
  validObjectFieldValue({ id: 'emoji', label: 'Appearance', kind: 'emoji', value: '🔳' }, value);

export const walkableTile = defineObject<WalkableTileState>({
  type: 'example.walkable-tile',
  version: 1,
  emoji: '🔳',
  legacyEmojis: ['🟦'],
  label: 'Walkable tile',
  hint: 'a walkable floor tile with an emoji chosen by the world owner or moderators',
  initial: () => ({ emoji: '🔳' }),
  valid: (state): state is WalkableTileState =>
    record(state) &&
    exactKeys(state, ['emoji']) &&
    (!Object.prototype.hasOwnProperty.call(state, 'emoji') || validEmoji(state.emoji)),
  walkable: true,
  editPolicy: 'placer-admin',
  configuration: { action: 'appearance', fields: ['emoji'], remember: true },
  actions: {
    appearance: {
      permission: 'editor',
      run: (_state, payload) => {
        requirePayload(payload, ['emoji']);
        const emoji = typeof payload.emoji === 'string' ? payload.emoji.trim() : '';
        if (!validEmoji(emoji)) throw new ObjectActionError(400, 'Choose one emoji.');
        return { emoji };
      },
    },
  },
  view: (state, viewer) => ({
    title: 'Walkable tile',
    description: '',
    fields: viewer.canEdit
      ? [{ id: 'emoji', label: 'Appearance', kind: 'emoji', value: state.emoji ?? '🔳' }]
      : [],
    controls: viewer.canEdit
      ? [
          {
            id: 'appearance',
            label: 'Set appearance',
            fields: ['emoji'],
            trigger: 'change',
            action: { name: 'appearance', payload: {} },
          },
        ]
      : [],
  }),
  // A full-cell emoji uses the existing bounded text-sprite capability. It does
  // not acquire the behavior of the chosen emoji (for example, fire or a portal).
  sprite: state => ({
    size: 64,
    layers: [
      {
        id: 'tile',
        shapes: [
          {
            kind: 'text',
            x: 32,
            y: 32,
            text: state.emoji ?? '🔳',
            size: 56,
            weight: 400,
            color: '#ffffff',
          },
        ],
      },
    ],
  }),
});
