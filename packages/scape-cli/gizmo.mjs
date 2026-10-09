import { terminal } from './terminal.mjs';
import { build } from 'esbuild';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function compileProject(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const entry = path.resolve(directory, manifest.scape?.entry ?? 'src/definition.ts');
  const result = await build({
    absWorkingDir: directory,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__scape',
    platform: 'neutral',
    target: 'es2022',
    loader: { '.glb': 'base64', '.wav': 'base64' },
    metafile: true,
    logLevel: 'silent',
    legalComments: 'none',
    minify: true,
  });
  const code = result.outputFiles[0].text;
  if (Buffer.byteLength(code) > 1048576) throw new Error('Build exceeds 1 MiB');
  return {
    code,
    files: Object.keys(result.metafile.inputs).map(file => path.resolve(directory, file)),
  };
}
async function sources(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'vendor'].includes(entry.name))
      continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sources(file)));
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|json|glb|wav)$/.test(entry.name))
      result.push(file);
  }
  return result;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function dev(directory, originValue) {
  const origin = new URL(originValue);
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !(
      origin.protocol === 'https:' ||
      (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
    )
  )
    throw new Error('Use an HTTPS Scape origin (HTTP is allowed only on localhost)');
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  let token,
    stopped = false,
    approved = false,
    previous = null,
    lastCode = '',
    files = [path.resolve(directory, manifest.scape?.entry ?? 'src/definition.ts')],
    signature = '',
    error = '',
    lastHeartbeat = 0;
  const request = async (action, body = {}) => {
    const response = await fetch(new URL(`/api/rooms/developer-link/${action}`, origin), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        Origin: origin.origin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const failure = new Error(result.error ?? 'Scape request failed');
      failure.status = response.status;
      throw failure;
    }
    return result;
  };
  const link = await request('start', { project: manifest.name ?? path.basename(directory) });
  token = link.secret;
  const url = new URL('/', origin);
  url.searchParams.set('playground', '1');
  url.searchParams.set('developer-connect', link.code);
  const ui = terminal();
  ui.heading('Gizmo development');
  ui.link(url.href);
  ui.line('Verify this code in Scape:', 'muted');
  ui.code(link.code);
  ui.line('Sign in and connect only if Scape shows this code.');
  ui.busy('Waiting for your approval');
  const stop = () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopped) {
      if (!approved) {
        const status = await request('poll');
        if (!status.approved) {
          await sleep(1500);
          continue;
        }
        approved = true;
        previous = status.revision;
        ui.success('Connected. Watching your project.');
      }
      try {
        const next = (
          await Promise.all(
            [
              ...new Set([
                ...files,
                ...(await sources(directory)),
                path.join(directory, 'package.json'),
              ]),
            ]
              .sort()
              .map(async file => {
                try {
                  const value = await stat(file);
                  return `${file}:${value.mtimeMs}:${value.size}`;
                } catch {
                  return `${file}:missing`;
                }
              }),
          )
        ).join('|');
        if (next !== signature) {
          signature = next;
          try {
            ui.busy('Building your world objects');
            const result = await compileProject(directory);
            files = result.files;
            if (result.code !== lastCode) {
              const uploaded = await request('upload', { code: result.code, previous });
              previous = uploaded.revision;
              lastCode = result.code;
              ui.success(`Preview updated · ${previous.slice(0, 8)}`);
            }
            ui.clear();
            error = '';
          } catch (failure) {
            if (failure.status === 403) throw failure;
            error = String(failure.message).slice(0, 1024);
            ui.error(error);
            ui.line(
              previous
                ? `Last confirmed build: ${previous.slice(0, 8)}. Edit and save to try again.`
                : 'No build has been accepted yet. Edit and save to try again.',
            );
            // HTTP conflicts require a fresh connection; never overwrite another build.
            if (failure.status === 409 && error.includes('active build changed')) throw failure;
            if (failure.status === 409 && error.startsWith('Wait a moment')) {
              signature = '';
              await sleep(1500);
            }
            if (!failure.errors && !failure.status) signature = ''; // Retry transient transport errors.
          }
        }
        if (Date.now() - lastHeartbeat > 10_000) {
          await request('heartbeat', { error });
          lastHeartbeat = Date.now();
        }
      } catch (failure) {
        if (failure.status === 403 || failure.status === 409) throw failure;
        ui.line('Connection interrupted. Retrying…', 'warning');
        signature = '';
        await sleep(1500);
      }
      await sleep(750);
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    ui.busy('Stopping live updates');
    await request('stop').catch(() => {});
    ui.success('Live updates stopped. Your world and saved state remain.');
    ui.close();
  }
}
