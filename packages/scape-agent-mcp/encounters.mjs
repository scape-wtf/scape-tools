import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const retention = 30 * 86400000,
  maxRecords = 4096,
  maxBytes = 2_000_000;
const fields = [
  'firstSeen',
  'lastSeen',
  'lastNearby',
  'nearbyMs',
  'lastConversation',
  'lastGreeting',
  'quietUntil',
  'spaceUntil',
];
const hash = value => createHash('sha256').update(value).digest('hex');
const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const privateError = () =>
  new Error(
    'Cannot access private encounter memory. Check its ownership, permissions and format; files must not be links.',
  );
async function directoryInfo(directory, create) {
  if (process.platform === 'win32')
    throw new Error(
      'Persistent encounter memory requires macOS, Linux or WSL. Set memory.enabled to false for temporary memory.',
    );
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    info.mode & 0o077
  )
    throw privateError();
}
async function readJSON(file) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid() ||
      info.mode & 0o077 ||
      info.size > maxBytes
    )
      throw privateError();
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw privateError();
  } finally {
    await handle?.close();
  }
}
function validate(data) {
  if (!data) return { version: 1, scopes: {} };
  if (
    data.version !== 1 ||
    !data.scopes ||
    typeof data.scopes !== 'object' ||
    Array.isArray(data.scopes)
  )
    throw privateError();
  for (const [id, scope] of Object.entries(data.scopes)) {
    if (
      !validKey(id) ||
      !scope ||
      typeof scope.origin !== 'string' ||
      typeof scope.room !== 'string' ||
      typeof scope.agent !== 'string' ||
      !scope.records ||
      typeof scope.records !== 'object' ||
      Array.isArray(scope.records)
    )
      throw privateError();
    if (
      scope.origin.length > 2048 ||
      scope.room.length > 256 ||
      scope.agent.length > 24 ||
      Object.keys(scope).some(k => !['origin', 'room', 'agent', 'records'].includes(k))
    )
      throw privateError();
    if (id !== hash(JSON.stringify([scope.origin, scope.room, scope.agent]))) throw privateError();
    for (const [key, record] of Object.entries(scope.records))
      if (
        !validKey(key) ||
        !record ||
        fields.some(k => !Number.isFinite(record[k]) || record[k] < 0) ||
        Object.keys(record).some(k => !fields.includes(k))
      )
        throw privateError();
  }
  return data;
}
function prune(data, now) {
  const records = [];
  for (const [scope, value] of Object.entries(data.scopes))
    for (const [key, record] of Object.entries(value.records)) {
      if (record.lastSeen < now - retention) delete value.records[key];
      else records.push({ scope, key, at: record.lastSeen });
    }
  records.sort((a, b) => b.at - a.at);
  for (const { scope, key } of records.slice(maxRecords)) delete data.scopes[scope].records[key];
  for (const [id, scope] of Object.entries(data.scopes))
    if (!Object.keys(scope.records).length) delete data.scopes[id];
}
async function acquire(directory) {
  const file = path.join(directory, 'encounters.lock'),
    id = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    let handle;
    try {
      handle = await open(file, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw privateError();
      const owner = await readJSON(file);
      let alive = false;
      if (Number.isSafeInteger(owner?.pid) && owner.pid > 0)
        try {
          process.kill(owner.pid, 0);
          alive = true;
        } catch (e) {
          alive = e.code === 'EPERM';
        }
      if (alive)
        throw new Error(
          'Encounter memory is in use. Stop the other agent before changing or opening it.',
        );
      await unlink(file).catch(e => {
        if (e.code !== 'ENOENT') throw privateError();
      });
      continue;
    }
    try {
      await handle.writeFile(JSON.stringify({ id, pid: process.pid }));
    } finally {
      await handle.close();
    }
    return async () => {
      if ((await readJSON(file))?.id === id) await unlink(file);
    };
  }
  throw new Error('Encounter memory is in use. Try again after the other command finishes.');
}
/** Owner-side encounter metadata only. No names, messages, credentials or inferred facts. */
export async function openEncounterMemory({
  directory,
  readOnly = false,
  now = Date.now,
  onError = () => {},
}) {
  let release, data;
  try {
    await directoryInfo(directory, !readOnly);
    if (!readOnly) release = await acquire(directory);
    data = validate(await readJSON(path.join(directory, 'encounters.json')));
    prune(data, now());
  } catch (error) {
    await release?.();
    if (readOnly && error.code === 'ENOENT') data = { version: 1, scopes: {} };
    else throw error;
  }
  let dirty = !readOnly,
    timer,
    chain = Promise.resolve(),
    closed = false,
    writeError;
  const flush = () => {
    if (readOnly || closed) return chain;
    clearTimeout(timer);
    timer = undefined;
    chain = chain
      .then(async () => {
        if (!dirty) return;
        dirty = false;
        prune(data, now());
        const text = JSON.stringify(data);
        if (Buffer.byteLength(text) > maxBytes) throw privateError();
        await directoryInfo(directory, false);
        await readJSON(path.join(directory, 'encounters.json'));
        const temporary = path.join(directory, `.encounters-${randomUUID()}.tmp`);
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try {
            await handle.writeFile(text);
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporary, path.join(directory, 'encounters.json'));
          writeError = undefined;
        } finally {
          await unlink(temporary).catch(() => {});
        }
      })
      .catch(() => {
        dirty = true;
        if (!writeError) {
          writeError = privateError();
          onError(
            'Encounter memory could not be saved. This run can continue, but recent encounters may not survive a restart.',
          );
        }
      });
    return chain.then(() => {
      if (writeError) throw writeError;
    });
  };
  const changed = () => {
    if (readOnly) throw new Error('Encounter memory is read-only.');
    dirty = true;
    if (!timer) {
      timer = setTimeout(() => {
        void flush().catch(() => {});
      }, 10000);
      timer.unref();
    }
  };
  const list = () => {
    prune(data, now());
    return Object.entries(data.scopes).flatMap(([scopeId, scope]) =>
      Object.entries(scope.records).map(([key, record]) => ({
        id: hash(scopeId + key),
        origin: scope.origin,
        room: scope.room,
        agent: scope.agent,
        ...record,
      })),
    );
  };
  return {
    list,
    scope({ origin, room, agent }) {
      const id = hash(JSON.stringify([origin, room, agent])),
        lastObserved = new Map();
      const get = (key, create = false) => {
        if (!validKey(key)) return undefined;
        let scope = data.scopes[id];
        if (!scope && create) {
          scope = { origin, room, agent, records: {} };
          data.scopes[id] = scope;
        }
        let record = scope?.records[key];
        if (record && record.lastSeen < now() - retention) {
          delete scope.records[key];
          record = undefined;
        }
        if (!record && create) {
          record = {
            firstSeen: now(),
            lastSeen: now(),
            lastNearby: 0,
            nearbyMs: 0,
            lastConversation: 0,
            lastGreeting: 0,
            quietUntil: 0,
            spaceUntil: 0,
          };
          scope.records[key] = record;
        }
        return record;
      };
      const change = (key, update) => {
        if (readOnly) throw new Error('Encounter memory is read-only.');
        const record = get(key, true);
        if (!record) return;
        update(record);
        changed();
      };
      return {
        get: key => {
          const r = get(key);
          return r ? { ...r } : undefined;
        },
        see(key, nearby) {
          change(key, r => {
            const at = now(),
              previous = lastObserved.get(key);
            if (nearby) {
              r.nearbyMs += previous === undefined ? 0 : Math.max(0, Math.min(at - previous, 5000));
              r.lastNearby = at;
            }
            r.lastSeen = at;
            lastObserved.set(key, at);
            while (lastObserved.size > maxRecords)
              lastObserved.delete(lastObserved.keys().next().value);
          });
        },
        greet(key) {
          change(key, r => {
            r.lastGreeting = now();
            r.lastSeen = now();
          });
        },
        spoke(key) {
          change(key, r => {
            r.lastConversation = now();
            r.lastSeen = now();
          });
        },
        boundary(key, { quietUntil = 0, spaceUntil = 0 }) {
          change(key, r => {
            r.quietUntil = quietUntil;
            r.spaceUntil = spaceUntil;
            r.lastSeen = now();
          });
        },
        context(key) {
          const r = get(key);
          return {
            metBefore: !!r && (r.lastGreeting > 0 || r.lastConversation > 0),
            ...(r
              ? {
                  firstSeen: r.firstSeen,
                  lastSeen: r.lastSeen,
                  lastConversation: r.lastConversation || undefined,
                  lastGreeting: r.lastGreeting || undefined,
                  secondsNearby: Math.floor(r.nearbyMs / 1000),
                }
              : {}),
          };
        },
      };
    },
    forget(prefix) {
      if (typeof prefix !== 'string' || !/^([a-f0-9]{12,64})$/.test(prefix))
        throw new Error('Choose one complete visitor ID from scape agent memory list.');
      const matches = list().filter(r => r.id.startsWith(prefix));
      if (matches.length !== 1)
        throw new Error('Choose one complete visitor ID from scape agent memory list.');
      if (readOnly) throw new Error('Encounter memory is read-only.');
      for (const [scopeId, scope] of Object.entries(data.scopes))
        for (const key of Object.keys(scope.records))
          if (hash(scopeId + key) === matches[0].id) delete scope.records[key];
      changed();
    },
    clear() {
      if (readOnly) throw new Error('Encounter memory is read-only.');
      data.scopes = {};
      changed();
    },
    flush,
    async close() {
      try {
        await flush();
        if (writeError) throw writeError;
      } finally {
        closed = true;
        clearTimeout(timer);
        await release?.();
      }
    },
  };
}
