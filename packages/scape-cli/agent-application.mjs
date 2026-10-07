import { dashboard } from './dashboard.mjs';
import { terminal } from './terminal.mjs';
import { managedAgent } from './managed-agent.mjs';
import { openConversationNotes } from '@scape-wtf/agent-mcp/notes';
import { lockProfile, readProfile, profileDirectory } from './profile.mjs';
import { runAgent } from '@scape-wtf/agent-mcp/runner';

/** One process, one runtime. Settings edits happen after the running agent has stopped. */
export async function agentApplication(
  { origin, project, autoStart = false, directory = profileDirectory() } = {},
  { createDashboard = dashboard, runManaged = managedAgent, createUI = terminal } = {},
) {
  let running,
    controller,
    controls,
    closing = false,
    resolveExit,
    fatal;
  const exit = new Promise(resolve => {
    resolveExit = resolve;
  });
  const view = createDashboard({ onAction: action });
  const refresh = async () => {
    if (project) return;
    const profile = await readProfile(directory);
    if (profile)
      view.event({
        type: 'identity',
        name: profile.config.name,
        origin: profile.origin,
        conversation: profile.config.provider?.model,
        decision: profile.config.decision?.model,
        conversationLimit: profile.config.limits?.maxModelCalls ?? 200,
        decisionLimit: profile.config.decision?.maxRequests,
      });
    await refreshNotes();
  };
  async function refreshNotes(forget) {
    if (controls) {
      if (forget) await controls.forgetMemory(forget);
      else await controls.refreshMemory();
      return;
    }
    if (project) return;
    let store, release;
    try {
      if (forget) release = await lockProfile(directory);
      store = await openConversationNotes({ directory, readOnly: !forget });
      if (forget) await store.forget(forget);
      view.event({ type: 'memory', notes: store.list() });
    } catch {
      view.notice('Conversation notes are unavailable. Check private storage permissions.');
    } finally {
      await store?.close();
      await release?.();
    }
  }
  async function launch(command = 'run') {
    if (running || closing) return;
    if (project && command !== 'run') {
      view.notice('Edit scape.agent.json in your project to change its settings.');
      return;
    }
    controller = new AbortController();
    controls = undefined;
    const ui = createUI();
    view.suspend();
    running = (async () => {
      try {
        const callbacks = {
          signal: controller.signal,
          onEvent: event => view.event(event),
          onControls: value => {
            controls = value;
          },
          onState: state => view.state(state),
        };
        if (project) {
          view.resume();
          await runAgent({ ...callbacks, directory: project, origin, log: text => view.log(text) });
        } else
          await runManaged(command, {
            ...callbacks,
            origin,
            directory,
            ui,
            onReady: () => view.resume(),
            onLog: text => view.log(text),
          });
      } catch (error) {
        // Managed/runtime errors are already bounded operational messages.
        view.log(error.message);
        view.notice(error.message);
        if (
          [401, 403].includes(error.status) ||
          [
            'unauthorized',
            'access_revoked',
            'permission_denied',
            'removed',
            'stale_session',
          ].includes(error.code)
        ) {
          fatal = error;
          closing = true;
          resolveExit();
        }
      } finally {
        ui.close();
        controls = undefined;
        view.state('stopped');
        try {
          await refresh();
        } catch {
          view.notice('Saved settings could not be reloaded.');
        }
        if (!closing) view.resume();
      }
    })();
    try {
      await running;
    } finally {
      running = undefined;
    }
  }
  async function action(value) {
    if (value === 'quit') {
      closing = true;
      controller?.abort();
      await running;
      resolveExit();
    } else if (value === 'stop') controller?.abort();
    else if (value === 'start') await launch();
    else if (value === 'configure' || value === 'login') {
      if (running) {
        view.notice('Stop the agent with x before changing its configuration or world.');
        return;
      }
      await launch(value);
    } else if (value === 'cancel-task') {
      await controls?.cancelTask();
    } else if (value === 'refresh-memory') {
      await refreshNotes();
    } else if (value?.type === 'forget' && value.id) {
      await refreshNotes(value.id);
    }
  }
  const stop = () => {
    void action('quit');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await refresh();
    if (autoStart) void launch();
    await exit;
  } finally {
    closing = true;
    controller?.abort();
    await running;
    view.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  if (fatal) throw fatal;
}
