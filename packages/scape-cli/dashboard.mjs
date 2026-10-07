import { emitKeypressEvents } from 'node:readline';
import { clean, palette } from './terminal.mjs';

export function supportsDashboard({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
} = {}) {
  return !!input.isTTY && !!output.isTTY && env.TERM !== 'dumb';
}

const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function fitLine(value, width) {
  let result = '',
    used = 0;
  for (const { segment } of segments.segment(clean(value))) {
    const cells =
      /[\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\uff01-\uff60]/u.test(
        segment,
      )
        ? 2
        : /^\p{Mark}+$/u.test(segment)
          ? 0
          : 1;
    if (used + cells > width) break;
    result += segment;
    used += cells;
  }
  return result;
}

/** Local process view. Never receives the profile, credentials, drafts or model reasoning. */
export function dashboard({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
  onAction = () => {},
} = {}) {
  const state = {
    phase: 'stopped',
    name: 'Your agent',
    tasks: [],
    notes: [],
    logs: [],
    conversationCalls: 0,
    decisionCalls: 0,
    conversationHealth: 'Not requested',
    decisionHealth: 'Not requested',
  };
  const tabs = ['Overview', 'Tasks', 'Memory', 'Logs'];
  let tab = 0,
    offset = 0,
    selected = 0,
    active = false,
    closed = false,
    timer,
    raw,
    flowing,
    confirm,
    inspecting = false;
  const color = !Object.hasOwn(env, 'NO_COLOR');
  const paint = (role, value) => (color ? `\x1b[38;2;${palette[role]}m${value}\x1b[0m` : value);
  const addLog = value => {
    state.logs.push(clean(value).slice(0, 2000));
    if (state.logs.length > 300) state.logs.shift();
  };
  const lines = () => {
    if (tab === 0)
      return [
        `${state.name} · ${state.phase}`,
        state.origin || 'Connect your agent to a Scape world.',
        state.room ? `World  ${state.room}` : '',
        '',
        `Conversation  ${state.conversation || 'Not configured'}`,
        `${state.conversationHealth} · ${state.conversationCalls} requests / ${state.conversationLimit === 0 ? 'unlimited' : (state.conversationLimit ?? '—')}`,
        '',
        `Decisions  ${state.decision || 'Basic world behavior'}`,
        `${state.decisionHealth} · ${state.decisionCalls} requests / ${state.decisionLimit === 0 ? 'unlimited' : (state.decisionLimit ?? '—')}`,
        '',
        's Start    x Stop    c Configure    p Connect world',
        'Use the tabs for task progress, saved memories and recent logs.',
      ];
    if (tab === 1)
      return state.tasks.length
        ? state.tasks.flatMap(task => [
            `${task.status} · ${task.steps.filter(step => step.status === 'complete').length}/${task.steps.length} steps`,
            ...task.steps.map(
              (step, i) =>
                `  ${i + 1}. ${step.action}${step.target ? ` ${fitLine(step.label || step.target, 30)}` : ''} · ${step.status}${step.error ? ` (${step.error})` : ''}`,
            ),
            '',
          ])
        : [
            'No tasks yet.',
            'Requests appear here when the agent accepts a plan.',
            'k Cancel the active task',
          ];
    if (tab === 2 && inspecting && state.notes[selected]) {
      const note = state.notes[selected],
        width = Math.max(1, (output.columns || 80) - 2);
      let text = clean(note.text),
        wrapped = [];
      while (text) {
        const line = fitLine(text, width);
        wrapped.push(line);
        text = text.slice(line.length);
      }
      return [`Saved note · ${note.room}`, 'Enter / Esc Back · f Forget', '', ...wrapped];
    }
    if (tab === 2)
      return [
        'Only explicitly requested notes are saved. No automatic transcripts.',
        '↑↓ Select    Enter Inspect    f Forget    r Refresh',
        '',
        ...(state.notes.length
          ? state.notes.map(
              (note, i) => `${i === selected ? '›' : ' '} ${note.text} · ${note.room}`,
            )
          : ['No saved notes. Enable conversation notes in Configure.']),
      ];
    return state.logs.length ? state.logs : ['No logs yet. Errors and activity will appear here.'];
  };
  const draw = () => {
    timer = undefined;
    if (!active || closed) return;
    const width = Math.max(1, (output.columns || 80) - 1);
    const height = Math.max(1, output.rows || 24);
    if (width < 40 || height < 10) {
      output.write(`\x1b[H\x1b[2J${fitLine('Scape · resize terminal · q Quit', width)}`);
      return;
    }
    const content = lines(),
      available = height - 7;
    offset = Math.max(0, Math.min(offset, Math.max(0, content.length - available)));
    const start = tab === 3 ? Math.max(0, content.length - available - offset) : offset;
    const body = content.slice(start, start + available);
    while (body.length < available) body.push('');
    const frame = [
      paint('primary', fitLine('  · · ·   Scape   · · ·', width)),
      '',
      paint(
        'focus',
        fitLine(
          tabs.map((name, i) => `${i + 1} ${i === tab ? `[${name}]` : name}`).join('   '),
          width,
        ),
      ),
      '─'.repeat(width),
      ...body.map(line => fitLine(line, width)),
      '─'.repeat(width),
      fitLine(confirm || '1–4 Tabs  ↑↓ Scroll  k Cancel task  q Quit / Ctrl+C', width),
      fitLine(state.notice || 'Settings and credentials stay on this computer.', width),
    ];
    output.write(`\x1b[H${frame.map(line => `\x1b[2K${line}`).join('\r\n')}`);
  };
  const render = () => {
    if (!active || closed || timer) return;
    timer = setTimeout(draw, 40);
    timer.unref?.();
  };
  const action = value => {
    try {
      Promise.resolve(onAction(value)).catch(() => {
        state.notice = 'Action failed. Check your saved settings and logs.';
        render();
      });
    } catch {
      state.notice = 'Action failed. Check your saved settings and logs.';
      render();
    }
  };
  const keypress = (text, key = {}) => {
    const name = key.name || text;
    if ((key.ctrl && name === 'c') || name === 'q') return action('quit');
    if (confirm) {
      if (name === 'y') action({ type: 'forget', id: state.notes[selected]?.id });
      confirm = undefined;
    } else if (/^[1-4]$/.test(text)) {
      tab = Number(text) - 1;
      offset = selected = 0;
      inspecting = false;
    } else if (name === 'tab' || name === 'right' || name === 'left') {
      tab = (tab + (name === 'left' || key.shift ? 3 : 1)) % 4;
      offset = selected = 0;
      inspecting = false;
    } else if (tab === 2 && (name === 'return' || name === 'escape')) {
      inspecting = name === 'return' && !inspecting;
      offset = 0;
    } else if (name === 'up' || name === 'down') {
      if (tab === 2 && !inspecting) {
        selected = Math.max(
          0,
          Math.min(state.notes.length - 1, selected + (name === 'up' ? -1 : 1)),
        );
        offset = Math.max(0, selected - Math.max(0, (output.rows || 24) - 12));
      } else offset += (name === 'up' ? -1 : 1) * (tab === 3 ? -1 : 1);
    } else if (name === 'f' && tab === 2 && state.notes[selected])
      confirm = 'Forget selected note? y Yes · any other key Cancel';
    else if (name === 'k') action('cancel-task');
    else if (name === 'r' && tab === 2) action('refresh-memory');
    else if (tab === 0 && ['s', 'x', 'c', 'p'].includes(name))
      action({ s: 'start', x: 'stop', c: 'configure', p: 'login' }[name]);
    render();
  };
  const ended = () => action('quit');
  const suspend = () => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    timer = undefined;
    input.removeListener('keypress', keypress);
    input.removeListener('end', ended);
    output.removeListener('resize', render);
    input.setRawMode?.(raw);
    if (flowing === false || flowing === null) input.pause();
    output.write('\x1b[?25h');
  };
  const resume = () => {
    if (active || closed) return;
    active = true;
    raw = !!input.isRaw;
    flowing = input.readableFlowing;
    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    input.on('keypress', keypress);
    input.on('end', ended);
    output.on('resize', render);
    output.write('\x1b[2J\x1b[H\x1b[?25l');
    draw();
  };
  output.write('\x1b[?1049h');
  resume();
  return {
    suspend,
    resume,
    log: value => {
      addLog(value);
      render();
    },
    state: phase => {
      state.phase = clean(phase);
      render();
    },
    notice: value => {
      state.notice = clean(value);
      render();
    },
    event(event) {
      if (event.type === 'session') {
        state.tasks = [];
        state.notes = [];
        state.conversationCalls = state.decisionCalls = 0;
        state.conversationHealth = state.decisionHealth = 'Not requested';
        state.notice = '';
      } else if (event.type === 'identity') {
        for (const key of [
          'name',
          'origin',
          'conversation',
          'decision',
          'conversationLimit',
          'decisionLimit',
        ])
          state[key] = event[key];
      } else if (event.type === 'world') state.room = event.room;
      else if (event.type === 'tasks') state.tasks = event.tasks;
      else if (event.type === 'memory') state.notes = event.notes;
      else if (event.type === 'diagnostic') {
        const prefix =
          event.event === 'conversation_request'
            ? 'conversation'
            : event.event === 'decision_request' || event.event === 'decision_skip'
              ? 'decision'
              : undefined;
        if (prefix) {
          if (event.calls !== undefined) state[`${prefix}Calls`] = event.calls;
          if (event.limit !== undefined) state[`${prefix}Limit`] = event.limit;
          state[`${prefix}Health`] =
            event.reason === 'suspended'
              ? 'Unavailable · check credentials and restart'
              : event.reason === 'budget_exhausted'
                ? 'Budget exhausted'
                : event.phase === 'start'
                  ? 'Requesting'
                  : event.phase === 'complete'
                    ? 'Available'
                    : event.phase === 'cancelled'
                      ? 'Cancelled'
                      : `Recovering${event.status ? ` · HTTP ${event.status}` : ''}${event.reason ? ` · ${event.reason}` : ''}`;
        }
        addLog(
          `${new Date().toISOString()} ${event.event} ${Object.entries(event)
            .filter(([key]) => !['type', 'event'].includes(key))
            .map(([key, value]) => `${key}=${value}`)
            .join(' ')}`,
        );
      }
      render();
    },
    close() {
      if (closed) return;
      suspend();
      closed = true;
      output.write('\x1b[?25h\x1b[?1049l');
    },
  };
}
