import { mkdir, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const limit = 1024 * 1024;
/** Explicit opt-in: private, bounded local diagnostic content, never a provider upload. */
export async function openReplyTrace({ directory, secrets = [], log = () => {} }) {
  const folder = path.join(directory, '.scape-traces');
  const file = path.join(folder, 'replies.jsonl');
  let handle,
    disabled = false,
    size = 0,
    queue = Promise.resolve();
  const report = message => {
    try {
      log(message);
    } catch {}
  };
  const disable = () => {
    if (!disabled)
      report(
        'Reply trace unavailable or full · diagnostics continue. Check the private .scape-traces/replies.jsonl file (1 MiB limit).',
      );
    disabled = true;
  };
  try {
    if (process.platform === 'win32') throw new Error();
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const parent = await lstat(folder);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== process.getuid() ||
      parent.mode & 0o077
    )
      throw new Error();
    handle = await open(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600,
    );
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== process.getuid() || info.mode & 0o077 || info.nlink !== 1)
      throw new Error();
    size = info.size;
    report(
      `Private reply tracing enabled · ${JSON.stringify(file)} · includes dialogue and drafts; review before sharing.`,
    );
  } catch {
    await handle?.close().catch(() => {});
    handle = undefined;
    disable();
  }
  const scrub = text =>
    secrets
      .filter(value => typeof value === 'string' && value.length)
      .sort((a, b) => b.length - a.length)
      .reduce((value, secret) => value.split(secret).join('[redacted]'), text);
  return {
    write(record) {
      queue = queue.then(async () => {
        if (disabled || !handle) return;
        try {
          const line =
            JSON.stringify({ at: new Date().toISOString(), ...record }, (key, value) =>
              /^(?:authorization|apiKey|api_key|token|password|secret)$/i.test(key)
                ? '[redacted]'
                : typeof value === 'string'
                  ? scrub(value)
                  : value,
            ) + '\n';
          const bytes = Buffer.byteLength(line);
          if (size + bytes > limit) {
            disable();
            return;
          }
          await handle.writeFile(line);
          size += bytes;
        } catch {
          disable();
        }
      });
      return queue;
    },
    async close() {
      await queue;
      await handle?.close().catch(() => {});
      handle = undefined;
    },
  };
}
