/** voting-booth: SDK definition and authored behavior. Scape supplies the host services. */
import {
  defineObject,
  exactKeys,
  ObjectActionError,
  actorId,
  record,
  requirePayload,
} from '@scape-wtf/sdk';
export interface VotingState {
  question: string;
  choices: string[];
  ballots: { voter: string; choice: number }[];
  round: number;
  open: boolean;
}
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const valid = (s: unknown): s is VotingState =>
  record(s) &&
  exactKeys(s, ['question', 'choices', 'ballots', 'round', 'open']) &&
  text(s.question, 120) &&
  Array.isArray(s.choices) &&
  s.choices.length >= 2 &&
  s.choices.length <= 4 &&
  s.choices.every(c => text(c, 60)) &&
  new Set(s.choices).size === s.choices.length &&
  Number.isSafeInteger(s.round) &&
  Number(s.round) >= 0 &&
  typeof s.open === 'boolean' &&
  Array.isArray(s.ballots) &&
  s.ballots.length <= 256 &&
  s.ballots.every(
    b =>
      record(b) &&
      exactKeys(b, ['voter', 'choice']) &&
      actorId(b.voter) &&
      Number.isInteger(b.choice) &&
      Number(b.choice) >= 0 &&
      Number(b.choice) < (s.choices as unknown[]).length,
  ) &&
  new Set(s.ballots.map(b => b.voter)).size === s.ballots.length;
function round(state: VotingState, payload: Record<string, unknown>) {
  if (payload.round !== state.round)
    throw new ObjectActionError(409, 'This poll changed. Open it again.');
}
export const votingBooth = defineObject<VotingState>({
  type: 'scape.voting-booth',
  version: 1,
  emoji: '🗳️',
  label: 'Voting booth',
  hint: 'tap to vote together',
  initial: () => ({
    question: 'What should we do next?',
    choices: ['Explore', 'Play a game'],
    ballots: [],
    round: 0,
    open: true,
  }),
  valid,
  actions: {
    vote: {
      permission: 'participant',
      run: (state, payload, context) => {
        requirePayload(payload, ['round', 'choice']);
        round(state, payload);
        if (!state.open) throw new ObjectActionError(409, 'Voting is closed');
        if (
          !Number.isInteger(payload.choice) ||
          Number(payload.choice) < 0 ||
          Number(payload.choice) >= state.choices.length
        )
          throw new ObjectActionError(400, 'Choose an answer');
        const ballots = state.ballots.filter(b => b.voter !== context.actorId);
        if (ballots.length >= 256) throw new ObjectActionError(409, 'This poll is full');
        return {
          ...state,
          ballots: [...ballots, { voter: context.actorId, choice: Number(payload.choice) }],
        };
      },
    },
    configure: {
      permission: 'editor',
      run: (state, payload) => {
        requirePayload(payload, ['round', 'question', 'choice0', 'choice1', 'choice2', 'choice3']);
        round(state, payload);
        if (state.ballots.length)
          throw new ObjectActionError(409, 'Reset the poll before changing its question');
        const question = typeof payload.question === 'string' ? payload.question.trim() : '';
        const choices = [payload.choice0, payload.choice1, payload.choice2, payload.choice3]
          .map(c => (typeof c === 'string' ? c.trim() : ''))
          .filter(Boolean);
        const next = {
          ...state,
          question,
          choices,
          round: state.round + 1,
        };
        if (!valid(next))
          throw new ObjectActionError(400, 'Enter a question and two to four different answers');
        return next;
      },
    },
    toggle: {
      permission: 'editor',
      run: (state, payload) => {
        requirePayload(payload, ['round']);
        round(state, payload);
        return {
          ...state,
          open: !state.open,
          round: state.round + 1,
        };
      },
    },
    reset: {
      permission: 'editor',
      run: (state, payload) => {
        requirePayload(payload, ['round']);
        round(state, payload);
        return {
          ...state,
          ballots: [],
          round: state.round + 1,
          open: true,
        };
      },
    },
  },
  view: (state, viewer) => ({
    title: state.question,
    description: `${state.ballots.length} vote${state.ballots.length === 1 ? '' : 's'} · ${state.open ? 'Voting open' : 'Voting closed'}. One vote per device. You can change your vote. Votes are not anonymous.`,
    fields:
      viewer.canEdit && !state.ballots.length
        ? [
            {
              id: 'question',
              label: 'Question',
              value: state.question,
              maxLength: 120,
            },
            ...Array.from({ length: 4 }, (_, i) => ({
              id: `choice${i}`,
              label: `Answer ${i + 1}${i > 1 ? ' (optional)' : ''}`,
              value: state.choices[i] || '',
              maxLength: 60,
            })),
          ]
        : [],
    controls: [
      ...state.choices.map((choice, i) => ({
        id: `vote-${i}`,
        label: `${choice} · ${state.ballots.filter(b => b.choice === i).length}`,
        action: { name: 'vote', payload: { choice: i, round: state.round } },
        disabled: !state.open,
        pressed: state.ballots.some(b => b.voter === viewer.actorId && b.choice === i),
      })),
      ...(viewer.canEdit
        ? [
            ...(!state.ballots.length
              ? [
                  {
                    id: 'configure',
                    label: 'Save question',
                    button: { preset: 'save' as const },
                    confirm: 'Save question?',
                    fields: ['question', 'choice0', 'choice1', 'choice2', 'choice3'],
                    action: { name: 'configure', payload: { round: state.round } },
                  },
                ]
              : []),
            {
              id: 'toggle',
              label: state.open ? 'Close voting' : 'Reopen voting',
              button: { preset: state.open ? ('close' as const) : ('start' as const) },
              confirm: state.open ? 'Close voting?' : 'Reopen voting?',
              action: { name: 'toggle', payload: { round: state.round } },
            },
            {
              id: 'reset',
              label: 'Reset poll',
              button: { preset: 'reset' as const },
              confirm: 'Clear all votes?',
              action: { name: 'reset', payload: { round: state.round } },
            },
          ]
        : []),
    ],
  }),
});

export default votingBooth;
