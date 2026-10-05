import { defineObject, exactKeys, record } from '@scape-wtf/sdk';

type State = Record<string, never>;

export default defineObject<State>({
  type: 'my-project.object',
  version: 1,
  emoji: '🧩',
  label: 'My gizmo',
  hint: 'Open my gizmo',
  initial: () => ({}),
  valid: (value): value is State => record(value) && exactKeys(value, []),
  actions: {},
  view: () => ({
    title: 'My gizmo',
    description: 'Ready for your idea. Edit src/definition.ts to begin.',
    controls: [],
  }),
});
