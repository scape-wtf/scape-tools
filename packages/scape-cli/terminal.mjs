import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { Writable } from 'node:stream';

// Terminal equivalents of the semantic palette in the Scape interface guide.
export const palette = {
  primary: '245;255;0',
  focus: '54;249;246',
  success: '57;255;20',
  warning: '254;222;93',
  danger: '255;23;68',
  muted: '143;143;143',
};
export const gridFrames = [
  '● · ·  · · ·',
  '· ● ·  · · ·',
  '· · ●  · · ·',
  '· · ·  · · ●',
  '· · ·  · ● ·',
  '· · ·  ● · ·',
];
export const clean = value =>
  String(value)
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
export class Back extends Error {
  constructor() {
    super('Back');
    this.name = 'Back';
  }
}
class Navigate extends Error {
  constructor(index) {
    super('Navigate');
    this.index = index;
  }
}
export class Cancelled extends Error {
  constructor() {
    super('Stopped. Your saved settings are unchanged.');
    this.name = 'Cancelled';
  }
}

export function terminal({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
} = {}) {
  const tty = !!input.isTTY && !!output.isTTY;
  const color = !!output.isTTY && !Object.hasOwn(env, 'NO_COLOR') && env.TERM !== 'dumb';
  const animate = tty && color && env.SCAPE_REDUCED_MOTION !== '1';
  const paint = (role, text) =>
    color ? `\x1b[38;2;${palette[role]}m${clean(text)}\x1b[0m` : clean(text);
  let timer,
    pending = '',
    frame = 0,
    cancelPrompt;
  const width = () => Math.max(12, (output.columns || 80) - 3);
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const truncate = value => {
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
      if (used + cells > width()) break;
      result += segment;
      used += cells;
    }
    return result;
  };
  const clear = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (pending && animate) output.write('\r\x1b[2K');
    pending = '';
  };
  const line = (text = '', role) => {
    clear();
    output.write(`  ${role ? paint(role, text) : clean(text)}\n`);
  };
  const busy = text => {
    clear();
    pending = clean(text);
    if (!animate) {
      output.write(`  ${pending}\n`);
      return;
    }
    const draw = () =>
      output.write(
        `\r\x1b[2K  ${paint('focus', truncate(`${gridFrames[frame++ % gridFrames.length]}  ${pending}`))}`,
      );
    draw();
    timer = setInterval(draw, 160);
    timer.unref();
  };
  async function ask(
    label,
    { value = '', secret = false, required = true, validate, canBack = false } = {},
  ) {
    clear();
    if (!tty)
      throw new Error(
        'Setup needs an interactive terminal. Run scape agent run in a terminal first, or use --project <directory> for scripted configuration.',
      );
    while (true) {
      // A muted output stream lets readline edit a secret without echoing its contents.
      const sink = new Writable({
        write(chunk, encoding, done) {
          if (!secret) output.write(chunk);
          done();
        },
      });
      sink.isTTY = true;
      sink.columns = output.columns || 80;
      const prompt = `  ${paint('focus', '›')} ${clean(label)}${value && !secret ? ` ${paint('muted', `[${value}]`)}` : ''}: `;
      if (secret) output.write(prompt);
      const rl = createInterface({ input, output: sink, terminal: true });
      const controller = new AbortController();
      const cancel = () => controller.abort(new Cancelled());
      const navigate = (_, key) => {
        if (key?.name === 'escape') controller.abort(canBack ? new Back() : new Cancelled());
      };
      input.on('keypress', navigate);
      cancelPrompt = cancel;
      rl.once('SIGINT', cancel);
      const eof = () => {
        if (!controller.signal.aborted) controller.abort();
      };
      rl.once('close', eof);
      let result;
      try {
        result = (await rl.question(secret ? '' : prompt, { signal: controller.signal })).trim();
      } catch {
        throw controller.signal.reason instanceof Back ? controller.signal.reason : new Cancelled();
      } finally {
        input.removeListener('keypress', navigate);
        cancelPrompt = undefined;
        rl.removeListener('close', eof);
        rl.close();
        if (secret) output.write('\n');
      }
      result ||= value;
      if (required && !result) {
        line('Enter a value to continue.', 'warning');
        continue;
      }
      try {
        if (validate) await validate(result);
        return result;
      } catch (error) {
        line(error.message, 'warning');
      }
    }
  }
  async function choose(label, choices, current, { canBack = false } = {}) {
    clear();
    if (!tty)
      throw new Error(
        'Selection needs an interactive terminal. Use --project <directory> for scripted configuration.',
      );
    if (!choices.length) throw new Error('No options are available.');
    const rich = color,
      wasRaw = !!input.isRaw,
      wasFlowing = input.readableFlowing;
    let selected = Math.max(
        0,
        choices.findIndex(c => c.value === current),
      ),
      rows = 0,
      accepted = false;
    const erase = () => {
      if (rich && rows) {
        output.write(`\x1b[${rows}A\r\x1b[0J`);
        rows = 0;
      }
    };
    const draw = () => {
      erase();
      const count = Math.max(2, Math.min(7, (output.rows || 24) - 7)),
        start = Math.max(0, Math.min(selected - Math.floor(count / 2), choices.length - count));
      const texts = [
        paint('focus', truncate(label)),
        ...choices.slice(start, start + count).map((choice, i) => {
          const active = start + i === selected;
          return paint(
            active ? 'focus' : 'muted',
            truncate(`${active ? '›' : ' '} ${start + i + 1}. ${choice.label}`),
          );
        }),
        ...(width() < 48
          ? ['↑↓ Move', 'Enter/Space: OK', `Esc ${canBack ? 'Back' : 'Cancel'}`]
          : [`↑↓ Move · Enter/Space Select · Esc ${canBack ? 'Back' : 'Cancel'}`]
        ).map(hint => paint('muted', truncate(hint))),
      ];
      if (choices.length > count)
        texts.splice(-1, 0, paint('muted', `${selected + 1} of ${choices.length}`));
      output.write(texts.map(text => `  ${text}\n`).join(''));
      rows = texts.length;
    };
    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    if (rich) output.write('\x1b[?25l');
    draw();
    try {
      return await new Promise((resolve, reject) => {
        const end = () => finish(new Cancelled());
        const resize = () => {
          if (rich) draw();
        };
        const finish = (error, value) => {
          input.off('keypress', key);
          input.off('end', end);
          input.off('close', end);
          output.off('resize', resize);
          cancelPrompt = undefined;
          if (error) reject(error);
          else {
            accepted = true;
            resolve(value);
          }
        };
        const key = (text, key = {}) => {
          if (key.ctrl && ['c', 'd'].includes(key.name)) {
            finish(new Cancelled());
            return;
          }
          if (key.name === 'escape' || key.name === 'left') {
            finish(canBack ? new Back() : new Cancelled());
            return;
          }
          if (['return', 'enter', 'space', 'right'].includes(key.name) || text === ' ') {
            finish(undefined, choices[selected].value);
            return;
          }
          let next = selected;
          if (key.name === 'up' || key.name === 'k')
            next = (selected - 1 + choices.length) % choices.length;
          else if (key.name === 'down' || key.name === 'j') next = (selected + 1) % choices.length;
          else if (key.name === 'home') next = 0;
          else if (key.name === 'end') next = choices.length - 1;
          else if (key.name === 'pageup') next = Math.max(0, selected - 7);
          else if (key.name === 'pagedown') next = Math.min(choices.length - 1, selected + 7);
          else if (/^[1-9]$/.test(text) && Number(text) <= choices.length) next = Number(text) - 1;
          if (next !== selected) {
            selected = next;
            if (rich) draw();
            else line(`› ${choices[selected].label}`, 'focus');
          }
        };
        cancelPrompt = end;
        input.on('keypress', key);
        input.once('end', end);
        input.once('close', end);
        output.on('resize', resize);
      });
    } finally {
      erase();
      input.setRawMode?.(wasRaw);
      if (wasFlowing !== true) input.pause();
      if (rich) output.write('\x1b[?25h');
      if (accepted) line(`${label}  ${choices[selected].label}`);
    }
  }
  async function wizard(run) {
    let answers = [],
      target = 0;
    try {
      while (true) {
        let index = 0,
          step,
          shownStep;
        const prompt = async (kind, label, args) => {
          const slot = index++,
            cached = answers[slot]?.label === label ? answers[slot] : undefined;
          if (slot < target && cached) return cached.value;
          if (slot < target) target = slot;
          if (step && shownStep !== step.join(' ')) {
            ui.step(...step);
            shownStep = step.join(' ');
          }
          if (kind === 'ask') line(`Enter to continue · Esc ${slot ? 'back' : 'cancel'}`, 'muted');
          try {
            const value =
              kind === 'ask'
                ? await ask(label, {
                    ...args[0],
                    ...(cached ? { value: cached.value } : {}),
                    canBack: slot > 0,
                  })
                : await choose(label, args[0], cached?.value ?? args[1], { canBack: slot > 0 });
            if (cached && cached.value !== value) answers.length = slot;
            answers[slot] = { label, value };
            target = slot + 1;
            return value;
          } catch (error) {
            if (error instanceof Back) throw new Navigate(Math.max(0, slot - 1));
            throw error;
          }
        };
        const flow = {
          ...ui,
          ask: (label, ...args) => prompt('ask', label, args),
          choose: (label, ...args) => prompt('choose', label, args),
          step: (...args) => {
            step = args;
          },
          line: (...args) => {
            if (index >= target) line(...args);
          },
          busy: (...args) => {
            if (index >= target) busy(...args);
          },
          jump(label) {
            const slot = answers.findIndex(a => a?.label === label);
            if (slot >= 0) {
              answers[index - 1] = undefined;
              throw new Navigate(slot);
            }
          },
        };
        try {
          return await run(flow);
        } catch (error) {
          if (!(error instanceof Navigate)) throw error;
          target = error.index;
          clear();
          line('Change your selection. Nothing is saved yet.', 'muted');
        }
      }
    } finally {
      answers = [];
    }
  }
  const ui = {
    tty,
    paint,
    line,
    busy,
    clear,
    ask,
    choose,
    wizard,
    heading(title) {
      line();
      line('·  ·  ·    Scape    ·  ·  ·', 'primary');
      line(title);
      line('────────────────────────────', 'muted');
    },
    link(value) {
      const url = new URL(clean(value));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Browser links must use HTTP or HTTPS.');
      }
      const href = url.href;
      line();
      line('Open in your browser', 'focus');
      line('─'.repeat(Math.min(width(), 64)), 'focus');
      // Keep the URL intact so narrow terminals can wrap it without breaking copying.
      // OSC 8 makes the full address clickable in terminals that support hyperlinks.
      const link = color
        ? `\x1b]8;;${href}\x1b\\\x1b[1;4;38;2;${palette.focus}m${href}\x1b[0m\x1b]8;;\x1b\\`
        : href;
      output.write(`  ${link}\n`);
      line('─'.repeat(Math.min(width(), 64)), 'focus');
      line('Cmd/Ctrl-click to open, or copy the URL into your browser.', 'muted');
      line();
    },
    code(value) {
      const grouped =
        clean(value)
          .replace(/\s/g, '')
          .match(/.{1,4}/g)
          ?.join(' ') ?? '';
      const text = `  ${grouped}  `,
        size = Math.max(24, [...text].length);
      line(`╭${'─'.repeat(size)}╮`, 'muted');
      line(`│${text.padEnd(size)}│`, 'primary');
      line(`╰${'─'.repeat(size)}╯`, 'muted');
    },
    cancel() {
      cancelPrompt?.();
    },
    step(index, title) {
      line();
      line(`${index}  ${title}`, 'primary');
    },
    success(text) {
      line(`✓ ${text}`, 'success');
    },
    error(text) {
      line(`! ${text}`, 'danger');
    },
    close() {
      cancelPrompt?.();
      clear();
    },
  };
  return ui;
}
