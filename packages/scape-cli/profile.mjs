import { mkdir, open, readFile, rename, unlink, lstat, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function profileDirectory(env = process.env) {
  return path.resolve(env.SCAPE_CLI_HOME || path.join(homedir(), '.scape'));
}
export async function privateDirectory(directory) {
  if (process.platform === 'win32') throw new Error('Managed credential storage requires macOS, Linux or WSL. Use explicit project mode with environment credentials on native Windows.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new Error('The Scape profile must be a local directory, not a symbolic link.');
  await chmod(directory, 0o700);
}
export async function savePrivateJSON(directory, name, value) {
  if (!['agent.json'].includes(name)) throw new Error('Invalid credential record.');
  await privateDirectory(directory);
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path.join(directory, name));
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function readPrivateJSON(directory, name) {
  if (name !== 'agent.json') throw new Error('Invalid credential record.');
  let handle;
  try {
    const parent = await lstat(directory);
    if (process.platform === 'win32' || !parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid?.() || (parent.mode & 0o077)) throw new Error();
    handle = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) || info.nlink !== 1 || info.size > 1_000_000) throw new Error();
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error('Cannot read the private Scape profile. Check ownership, owner-only permissions and that credential files are not links.');
  } finally { await handle?.close(); }
}
export const saveProfile = (directory, profile) => savePrivateJSON(directory, 'agent.json', profile);
export async function readProfile(directory) {
  const profile = await readPrivateJSON(directory, 'agent.json');
  if (profile && (profile.version !== 1 || !profile.config || typeof profile.origin !== 'string')) throw new Error('Invalid Scape profile. Run scape agent configure after restoring a valid profile.');
  return profile;
}
export function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
export async function runningProfile(directory) {
  try { const lock = JSON.parse(await readFile(path.join(directory, 'agent.lock'), 'utf8')); return processAlive(lock.pid) ? lock : undefined; }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error('Cannot read the Scape process lock. Check agent.lock in the profile directory.'); }
}
export async function lockProfile(directory) {
  await privateDirectory(directory);
  const file = path.join(directory, 'agent.lock'), id = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    let handle;
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await runningProfile(directory)) throw new Error('This agent is already running or being configured. Stop that process before changing it.');
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); continue;
    }
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, id })); } finally { await handle.close(); }
    return async () => { try { const lock = JSON.parse(await readFile(file, 'utf8')); if (lock.id === id) await unlink(file); } catch {} };
  }
  throw new Error('Another Scape command is updating this profile. Try again.');
}
