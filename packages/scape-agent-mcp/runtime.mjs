import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const actions = new Set([
  'scape_speak',
  'scape_move_to',
  'scape_step',
  'scape_stop',
  'scape_interact',
  'scape_expression',
  'scape_follow',
  'scape_approach',
]);
const lifecycle = new Set(['scape_pair', 'scape_enter', 'scape_leave']);

/** Adapt an already connected MCP client. No model or credentials are owned here. */
export function mcpTools(client) {
  return {
    async call(name, args = {}, options = {}) {
      const result = await client.callTool({ name, arguments: args }, undefined, options);
      const value =
        result.structuredContent ??
        JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid Scape tool response');
      if (result.isError) {
        const error = new Error(value.error || `Scape tool ${name} failed`);
        if (typeof value.code === 'string') error.code = value.code;
        throw error;
      }
      return value;
    },
  };
}

/** Local snapshot differ, not a durable message inbox. Baseline existing bubbles. */
export class AgentActivity {
  #previous;
  #speech = new Map();
  update(state) {
    const previous = this.#previous;
    if (previous && previous.sessionId !== state.sessionId)
      throw new Error('Agent session changed');
    const events = [];
    const ready = state.status === 'connected' && !!state.self;
    const wasReady = previous?.status === 'connected' && !!previous.self;
    if (ready && !wasReady) events.push({ type: 'ready' });
    const visible = new Set(state.players.map(player => player.id));
    for (const id of this.#speech.keys()) if (!visible.has(id)) this.#speech.delete(id);
    for (const player of state.players) {
      const old = this.#speech.get(player.id);
      // A newly visible settled bubble is context, not evidence of a new message.
      const changed = old && (old.revision !== player.textRevision || old.text !== player.text);
      const pending = changed || (old?.pending ?? !player.settled);
      if (
        ready &&
        old &&
        pending &&
        player.settled &&
        player.text.trim() &&
        !['…', '...'].includes(player.text.trim())
      ) {
        events.push({ type: 'speech', player: { ...player } });
      }
      this.#speech.set(player.id, {
        revision: player.textRevision,
        text: player.text,
        pending: !ready || !player.settled ? pending : false,
      });
    }
    if (ready && wasReady) {
      const before = new Set((previous.roster ?? previous.players).map(player => player.id));
      const after = new Set((state.roster ?? state.players).map(player => player.id));
      const joined = [...after].filter(id => !before.has(id));
      const left = [...before].filter(id => !after.has(id));
      if (joined.length || left.length) events.push({ type: 'participants', joined, left });
      for (const key of ['movement', 'pursuit']) {
        const value = state[key];
        if (value && (value.id !== previous[key]?.id || value.status !== previous[key]?.status)) {
          events.push({ type: key, operation: { ...value } });
        }
      }
    }
    this.#previous = state;
    return events;
  }
}

/** Run one entered session. Observation continues independently of reasoning. */
export async function runAgentSession({
  tools,
  initialObservation,
  createAgent,
  signal,
  observeWaitMs = 1000,
  tickMs = 40,
  maxPendingEvents = 128,
}) {
  if (!Number.isInteger(observeWaitMs) || observeWaitMs < 1 || observeWaitMs > 25_000)
    throw new Error('observeWaitMs must be 1–25000');
  if (!Number.isInteger(tickMs) || tickMs < 10) throw new Error('tickMs must be at least 10');
  if (!Number.isInteger(maxPendingEvents) || maxPendingEvents < 1)
    throw new Error('maxPendingEvents must be positive');
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  const activity = new AgentActivity();
  let observation = initialObservation,
    agent,
    timer,
    failure,
    running = false,
    events = [],
    turnController;
  let thinking = false,
    displayedText = observation.self?.text ?? '',
    pendingText,
    textVersion = 0;
  let stopped;
  const whenStopped = new Promise(resolve => {
    stopped = resolve;
  });
  controller.signal.addEventListener('abort', () => stopped(), { once: true });
  if (controller.signal.aborted) stopped();
  const fail = error => {
    if (!controller.signal.aborted) {
      failure = error;
      stop();
    }
  };
  const scopedTools = {
    async call(name, args = {}, options = {}) {
      controller.signal.throwIfAborted();
      if (lifecycle.has(name))
        throw new Error('Session lifecycle belongs to the owner. Use context.stop() to leave.');
      if (observation.status !== 'connected' || !observation.self)
        throw new Error('Wait for a connected agent observation');
      const combined = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
      const text = name === 'scape_speak' ? args.text : name === 'scape_stop' ? '' : undefined;
      const version = text === undefined ? undefined : ++textVersion;
      const previousText = displayedText,
        previousPending = pendingText;
      if (version !== undefined) {
        displayedText = pendingText = text;
        if (name === 'scape_stop') thinking = false;
      }
      const argumentsWithId = actions.has(name)
        ? { ...args, commandId: args.commandId ?? `t${Date.now()}_${randomUUID()}` }
        : args;
      try {
        const result = await tools.call(name, argumentsWithId, { ...options, signal: combined });
        controller.signal.throwIfAborted();
        return result;
      } catch (error) {
        if (version !== undefined && version === textVersion) {
          displayedText = previousText;
          pendingText = previousPending;
        }
        throw error;
      }
    },
  };
  const context = {
    tools: scopedTools,
    signal: controller.signal,
    stop,
    get thinking() {
      return thinking;
    },
    async setThinking(value) {
      thinking = value;
      if (controller.signal.aborted || observation.status !== 'connected' || !observation.self)
        return;
      if (value && !displayedText) await scopedTools.call('scape_speak', { text: '…' });
      else if (!value && displayedText === '…') await scopedTools.call('scape_speak', { text: '' });
    },
    interrupt() {
      turnController?.abort();
    },
    requestTurn() {
      if (controller.signal.aborted || observation.status !== 'connected') return;
      if (!events.some(event => event.type === 'idle')) {
        if (events.length >= maxPendingEvents) {
          fail(new Error('Agent event queue is full; runner stopped'));
          return;
        }
        events.push({ type: 'idle' });
      }
      dispatch();
    },
    get observation() {
      return observation;
    },
  };
  const dispatch = () => {
    if (running || !events.length || !agent?.onTurn || controller.signal.aborted) return;
    const batch = events;
    events = [];
    running = true;
    const pending = new AbortController();
    turnController = pending;
    const turnSignal = AbortSignal.any([controller.signal, pending.signal]);
    const turnContext = {
      ...context,
      signal: turnSignal,
      get thinking() {
        return thinking;
      },
      async setThinking(value) {
        if (value) turnSignal.throwIfAborted();
        // Cleanup still works when just this decision was interrupted.
        await context.setThinking(value);
      },
      get observation() {
        return observation;
      },
      tools: {
        async call(name, args = {}, options = {}) {
          turnSignal.throwIfAborted();
          const signal = options.signal
            ? AbortSignal.any([turnSignal, options.signal])
            : turnSignal;
          const result = await scopedTools.call(name, args, { ...options, signal });
          turnSignal.throwIfAborted();
          return result;
        },
      },
    };
    // Catch provider failures even after shutdown; never allow a late turn to act.
    void Promise.resolve()
      .then(() => {
        turnSignal.throwIfAborted();
        return agent.onTurn({ observation, events: batch }, turnContext);
      })
      .catch(error => {
        if (!pending.signal.aborted) fail(error);
      })
      .finally(() => {
        running = false;
        turnController = undefined;
        dispatch();
      });
  };
  const accept = state => {
    if (state.sessionId !== initialObservation.sessionId)
      throw new Error('Agent session changed; start a new session');
    if (state.status !== 'connected' && state.status !== 'connecting')
      throw new Error('Agent disconnected');
    observation = state;
    const observedText = state.self?.text ?? '';
    // A poll already in flight may still contain the preceding bubble. Do not
    // let it erase knowledge of an acknowledged reply or clear that reply later.
    if (pendingText === undefined || observedText === pendingText) {
      displayedText = observedText;
      pendingText = undefined;
    }
    const changes = activity.update(state);
    // Remove queued speech which is no longer visible/authorized in the current snapshot.
    const visible = new Set(state.players.map(player => player.id));
    events = events.filter(event => event.type !== 'speech' || visible.has(event.player.id));
    if (agent.onTurn) {
      events.push(...changes);
      if (events.length > maxPendingEvents)
        throw new Error('Agent event queue is full; runner stopped');
    }
    agent.onObservation?.(state, changes, context);
    dispatch();
  };
  try {
    if (controller.signal.aborted) return;
    agent = createAgent(context);
    accept(initialObservation);
    if (agent.tick)
      timer = setInterval(() => {
        if (!controller.signal.aborted)
          try {
            agent.tick(Date.now(), context);
          } catch (error) {
            fail(error);
          }
      }, tickMs);
    const observe = async () => {
      while (!controller.signal.aborted) {
        const state = await tools.call(
          'scape_observe',
          { afterRevision: observation.revision, waitMs: observeWaitMs },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) break;
        accept(state);
        // A changing world can return immediately. Yield without flooding the MCP host.
        await delay(25, undefined, { signal: controller.signal });
      }
    };
    void observe().catch(fail);
    await whenStopped;
    if (failure) throw failure;
  } finally {
    stop();
    clearInterval(timer);
    signal?.removeEventListener('abort', stop);
    // Do not wait for an uncooperative model before withdrawing presence.
    try {
      await tools.call('scape_leave');
    } finally {
      await agent?.close?.();
    }
  }
}
