import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const retention = 30 * 86400000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textOK = value =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 500 &&
  !/[\p{Cc}\p{Cf}]/u.test(value);

/** Explicit player-authored notes, separate from encounter metadata and debug traces. */
export async function openConversationNotes({ directory, readOnly = false, now = Date.now }) {
  if (process.platform === 'win32')
    throw new Error('Private conversation notes require a POSIX filesystem; use WSL on Windows.');
  const folder = path.join(directory, '.scape-notes');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const info = await lstat(folder);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    info.mode & 0o077
  )
    throw new Error('Conversation notes require a private owner-only directory.');
  const file = path.join(folder, 'notes.json'),
    lock = path.join(folder, 'writer.lock');
  let locked = false,
    rows = [],
    pending = Promise.resolve(),
    closed = false,
    needsPrune = false;
  const privateRead = async (name, maximum) => {
    const handle = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.uid !== process.getuid() ||
        stat.mode & 0o077 ||
        stat.size > maximum
      )
        throw new Error('Unsafe conversation memory file.');
      return await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  };
  if (!readOnly) {
    // An interrupted process leaves a PID, so it can be recovered without deleting a live writer's lock.
    try {
      const pid = Number(await privateRead(lock, 32));
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error('Invalid conversation memory lock.');
      try {
        process.kill(pid, 0);
        throw new Error('Conversation memory is already open.');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      await unlink(lock);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const handle = await open(lock, 'wx', 0o600);
    try {
      await handle.writeFile(String(process.pid));
      locked = true;
    } finally {
      await handle.close();
    }
  }
  const prune = () => {
    rows = rows.filter(row => row.at <= now() && now() - row.at < retention).slice(-256);
  };
  try {
    const saved = JSON.parse(await privateRead(file, 1024 * 1024));
    if (saved.version !== 1 || !Array.isArray(saved.notes) || saved.notes.length > 256)
      throw new Error();
    for (const row of saved.notes) {
      if (
        !row ||
        Object.keys(row).sort().join(',') !== 'at,id,room,scope,text,visitor' ||
        !/^[a-f0-9]{64}$/.test(row.scope) ||
        !/^[a-f0-9]{64}$/.test(row.visitor) ||
        !/^[a-f0-9-]{36}$/.test(row.id) ||
        !textOK(row.text) ||
        !textOK(row.room) ||
        !Number.isSafeInteger(row.at)
      )
        throw new Error();
    }
    rows = saved.notes;
    prune();
    needsPrune = rows.length !== saved.notes.length;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      if (locked) await unlink(lock);
      throw new Error(
        'Cannot read private conversation notes. Inspect the local notes file before retrying.',
      );
    }
  }
  const mutate = change => {
    if (readOnly || closed) throw new Error('Conversation notes are read-only.');
    const write = pending.then(async () => {
      prune();
      const next = change(rows.map(row => ({ ...row }))).slice(-256);
      const data = JSON.stringify({ version: 1, notes: next });
      const temp = path.join(folder, `${randomUUID()}.tmp`);
      let handle;
      try {
        handle = await open(temp, 'wx', 0o600);
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temp, file);
        rows = next;
      } finally {
        await handle?.close();
        await unlink(temp).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    });
    // Each caller receives its failure; later writes remain usable after recovery.
    pending = write.catch(() => {});
    return write;
  };
  if (needsPrune && !readOnly) {
    try {
      await mutate(rows => rows);
    } catch (error) {
      if (locked) await unlink(lock);
      throw error;
    }
  }
  return {
    list() {
      prune();
      return rows.map(row => ({ ...row }));
    },
    async forget(id) {
      await mutate(rows => rows.filter(row => row.id !== id));
    },
    scope({ origin, room, agent }) {
      const scope = hash([origin, room, agent]);
      return {
        list(key) {
          prune();
          return key
            ? rows
                .filter(row => row.scope === scope && row.visitor === hash(key))
                .map(row => row.text)
            : [];
        },
        async remember(key, text) {
          if (!key || !textOK(text) || !textOK(room))
            throw new Error(
              'A stable visitor identity and a note up to 500 characters are required.',
            );
          const visitor = hash(key);
          await mutate(rows => {
            rows = rows.filter(
              row => !(row.scope === scope && row.visitor === visitor && row.text === text),
            );
            const existing = rows.filter(row => row.scope === scope && row.visitor === visitor);
            if (existing.length >= 20) rows = rows.filter(row => row.id !== existing[0].id);
            rows.push({ id: randomUUID(), scope, visitor, room, text, at: now() });
            return rows;
          });
        },
        async forget(key) {
          await mutate(rows =>
            rows.filter(row => !(row.scope === scope && row.visitor === hash(key))),
          );
        },
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      await pending;
      if (locked) {
        locked = false;
        await unlink(lock);
      }
    },
  };
}
