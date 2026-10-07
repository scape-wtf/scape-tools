export const taskTool = {
  name: 'agent_task',
  description:
    'Queue an ordered physical task requested by the current speaker. Use one plan containing every requested step in order. For "play the piano, come back to me and smile", queue use(piano), approach(speaker), express(happy); do not omit the return even if the player was nearby before the first step. Each visit/use waits for confirmed arrival before advancing. Do not claim completion when the plan is only accepted.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'target'],
          properties: {
            action: { type: 'string', enum: ['visit', 'use', 'approach', 'express'] },
            target: {
              type: 'string',
              maxLength: 120,
              description:
                'visit/use: exact scene.objects ID; approach: exact player ID; express: exact registered appearance.expressions name, such as happy (never a player or object ID).',
            },
          },
        },
      },
    },
  },
};
const invalid = () =>
  Object.assign(new Error('Choose 1–8 observed visit, use, approach or expression targets.'), {
    code: 'invalid_target',
  });

/** Session-local plans: no replay across a reconnect, no claiming acceptance as completion. */
export function createTaskQueue({ context, goals, call, now = Date.now, onChange = () => {} }) {
  let active,
    serial = 0;
  const history = [];
  const publish = () => {
    try {
      onChange(history.map(task => ({ ...task, steps: task.steps.map(step => ({ ...step })) })));
    } catch {
      // A local display failure must not change execution or cancellation.
    }
  };
  const finish = (status, error) => {
    const task = active;
    if (!task) return;
    task.status = status;
    for (const step of task.steps)
      if (step.status !== 'complete') {
        step.status = step.status === 'running' && status === 'failed' ? 'failed' : 'cancelled';
        if (error) step.error = error;
      }
    active = undefined;
    goals.clear();
    publish();
    return {
      type: 'task_result',
      player: task.player,
      request: task.request,
      status,
      steps: task.steps.map(step => ({ ...step })),
    };
  };
  return {
    get busy() {
      return !!active;
    },
    get player() {
      return active?.player;
    },
    cancel() {
      return finish('cancelled');
    },
    start(steps, player) {
      const state = context.observation;
      if (
        !player ||
        !state.players.some(p => p.id === player) ||
        !Array.isArray(steps) ||
        !steps.length ||
        steps.length > 8
      )
        throw invalid();
      for (const step of steps) {
        if (
          !step ||
          Object.keys(step).some(key => !['action', 'target'].includes(key)) ||
          typeof step.target !== 'string' ||
          step.target.length > 120
        )
          throw invalid();
        const valid = ['visit', 'use'].includes(step.action)
          ? state.scene?.objects.some(object => object.id === step.target)
          : step.action === 'approach'
            ? (state.roster ?? state.players).some(person => person.id === step.target)
            : step.action === 'express' && state.appearance?.expressions?.includes(step.target);
        if (!valid) throw invalid();
      }
      if (active)
        throw Object.assign(
          new Error('A task is already active. Wait for its result or cancel it.'),
          { code: 'task_pending' },
        );
      goals.clear();
      active = {
        id: ++serial,
        player,
        request: String(state.players.find(person => person.id === player)?.text ?? '').slice(
          0,
          1024,
        ),
        status: 'running',
        steps: steps.map(step => {
          const object = state.scene?.objects.find(object => object.id === step.target);
          const person = (state.roster ?? state.players).find(person => person.id === step.target);
          const label = String(
            object
              ? `${object.emoji || 'Object'} at ${object.x},${object.y}`
              : person?.name || step.target,
          ).slice(0, 120);
          return { ...step, label, status: 'pending' };
        }),
        index: 0,
      };
      history.unshift(active);
      history.length = Math.min(history.length, 20);
      publish();
      context.requestTurn();
      return { accepted: true, task: active.id, status: 'queued', steps: steps.length };
    },
    async advance(tools) {
      const task = active;
      if (!task) return;
      if (
        !(context.observation.roster ?? context.observation.players).some(p => p.id === task.player)
      )
        return finish('cancelled');
      const step = task.steps[task.index];
      try {
        if (step.status === 'pending') {
          step.status = 'running';
          step.expiresAt = now() + 45000;
          publish();
          if (step.action === 'express')
            await call('scape_expression', { expression: step.target }, tools);
          else if (step.action === 'approach')
            await call('scape_approach', { player: step.target }, tools);
          else await goals.start(step.target, step.action === 'use', task.player, tools);
        } else if (['visit', 'use'].includes(step.action)) {
          if (!goals.current || !(await goals.advance(tools)))
            throw Object.assign(new Error(), { code: 'target_unreachable' });
        }
        // Cancellation can arrive while a tool is pending. Never advance its old plan.
        if (active !== task) return;
        const state = context.observation;
        if (step.action === 'approach') {
          const target = (state.roster ?? state.players).find(p => p.id === step.target);
          if (!target) throw Object.assign(new Error(), { code: 'target_unavailable' });
          if (
            state.self?.floor !== target.floor ||
            Math.abs(state.self.x - target.x) + Math.abs(state.self.y - target.y) > 2 ||
            state.pursuit?.status === 'moving'
          ) {
            if (now() >= step.expiresAt)
              throw Object.assign(new Error(), { code: 'target_unreachable' });
            return;
          }
          await call('scape_stop', {}, tools);
        } else if (goals.current) return;
        if (active !== task) return;
        step.status = 'complete';
        task.index++;
        publish();
        if (task.index === task.steps.length) return finish('complete');
        context.requestTurn();
      } catch (error) {
        if (active !== task || context.signal.aborted) return;
        // Access and transport failures still reach the runtime's existing recovery boundary.
        if (
          ![
            'interaction_unavailable',
            'target_unavailable',
            'stale_target',
            'target_unreachable',
            'invalid_target',
            'movement_pending',
            'invalid_expression',
            'rate_limited',
          ].includes(error.code)
        )
          throw error;
        const result = finish('failed', error.code);
        if (step.action === 'approach' && context.observation.pursuit?.player === step.target)
          await call('scape_stop', {}, tools);
        return result;
      }
    },
  };
}
