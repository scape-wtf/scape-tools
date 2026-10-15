import { defineObject, exactKeys, ObjectActionError, record, requirePayload } from '@scape-wtf/sdk';
import { panelHtml } from './panel.js';

interface TerminalState {
  count: number;
  // Optional so already placed HTML counters remain readable, initially unsolved.
  solved?: boolean;
}

/** A gameplay puzzle, not an authentication lock: the author bundle is public. */
export const htmlPanel = defineObject<TerminalState>({
  type: 'scape.html-panel',
  version: 1,
  emoji: '🧮',
  label: 'Puzzle terminal',
  hint: 'solve the code to power a connected gizmo',
  initial: () => ({ count: 0, solved: false }),
  valid: (state): state is TerminalState =>
    record(state) &&
    exactKeys(state, ['count', 'solved']) &&
    Number.isSafeInteger(state.count) &&
    Number(state.count) >= 0 &&
    Number(state.count) <= 999999 &&
    (state.solved === undefined || typeof state.solved === 'boolean'),
  outputs: { solved: { label: 'Solved', kind: 'boolean' } },
  signals: state => ({ solved: state.solved === true }),
  actions: {
    submit: {
      permission: 'participant',
      run: (state, payload) => {
        requirePayload(payload, ['code']);
        if (typeof payload.code !== 'string' || !/^[0-9]{4}$/.test(payload.code))
          throw new ObjectActionError(400, 'Enter four digits.');
        if (state.solved) return state;
        return { count: Math.min(999999, state.count + 1), solved: payload.code === '3142' };
      },
    },
    reset: {
      permission: 'editor',
      run: (_state, payload) => {
        requirePayload(payload, []);
        return { count: 0, solved: false };
      },
    },
  },
  worldText: state => (state.solved ? 'Solved' : 'Locked'),
  web: {
    title: 'Puzzle terminal',
    html: panelHtml,
    interactive: true,
    context: true,
    actions: ['submit'],
  },
  view: (state, viewer) => ({
    title: 'Puzzle terminal',
    description: '',
    controls: viewer.canEdit
      ? [
          {
            id: 'reset',
            label: 'Reset puzzle',
            confirm: 'Reset the puzzle and turn off its output?',
            action: { name: 'reset', payload: {} },
          },
        ]
      : [],
    webData: { solved: state.solved === true },
  }),
});
