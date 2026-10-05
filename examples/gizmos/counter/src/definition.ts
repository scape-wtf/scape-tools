/** Counter owns the shared count and controls; Scape supplies persistence and permissions. */
import { defineObject, exactKeys, ObjectActionError, record, requirePayload } from '@scape-wtf/sdk';

/** Start here: state, validation, two actions, and a declarative view. */
export const counter = defineObject<{ count: number }>({
  type: 'scape.counter',
  version: 1,
  emoji: '🔢',
  label: 'Counter',
  hint: 'count together',
  initial: () => ({ count: 0 }),
  valid: (state): state is { count: number } =>
    record(state) &&
    exactKeys(state, ['count']) &&
    Number.isSafeInteger(state.count) &&
    Number(state.count) >= 0 &&
    Number(state.count) <= 9999,
  actions: {
    increment: {
      permission: 'participant',
      run: (state, payload) => {
        requirePayload(payload, []);
        if (state.count === 9999)
          throw new ObjectActionError(409, 'Reset the counter before adding more');
        return { count: state.count + 1 };
      },
    },
    reset: {
      permission: 'editor',
      run: (_state, payload) => {
        requirePayload(payload, []);
        return { count: 0 };
      },
    },
  },
  view: (state, viewer) => ({
    title: `${state.count}`,
    description: 'Everyone can add one. The object editor can reset the count.',
    controls: [
      {
        id: 'increment',
        label: 'Add one',
        action: { name: 'increment', payload: {} },
        disabled: state.count === 9999,
      },
      ...(viewer.canEdit
        ? [
            {
              id: 'reset',
              label: 'Reset count',
              confirm: 'Clear the count?',
              action: { name: 'reset', payload: {} },
            },
          ]
        : []),
    ],
  }),
});
