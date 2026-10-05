import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const run = args =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000 });

test('help and argument errors work without loading compiler or MCP dependencies', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-cli-help-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const standalone = path.join(directory, 'cli.mjs');
  await cp(script, standalone);
  await cp(new URL('./terminal.mjs', import.meta.url), path.join(directory, 'terminal.mjs'));
  for (const args of [
    [],
    ['--help'],
    ['gizmo', '--help'],
    ['agent', 'mcp', '--help'],
    ['agent', 'init', '--help'],
    ['agent', 'run', '--help'],
  ]) {
    const result = spawnSync(process.execPath, [standalone, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /scape gizmo init/);
    assert.match(result.stdout, /scape agent mcp config/);
    assert.match(result.stdout, /scape agent run/);
    assert.equal(result.stderr, '');
  }
  for (const args of [
    ['agent', 'run', '--unknown'],
    ['agent', 'mcp', 'serve', '--bad'],
    ['gizmo', 'init', 'one', 'two'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown command or invalid arguments/);
  }
});

test('namespaced initialization and its alias scaffold the same project without overwrites', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-cli-init-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const prefix of [['gizmo', 'init'], ['init']]) {
    const destination = path.join(directory, prefix.join('-'));
    const result = run([...prefix, destination]);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'));
    assert.equal(manifest.devDependencies['@scape-wtf/cli'], '0.1.1');
    assert.equal(manifest.scripts.dev, 'scape gizmo dev');
    assert.equal(manifest.scape.entry, 'src/project.ts');
    const original = await readFile(path.join(destination, 'src/project.ts'), 'utf8');
    assert.equal(run([...prefix, destination]).status, 1);
    assert.equal(await readFile(path.join(destination, 'src/project.ts'), 'utf8'), original);
  }
});

test('dev and its alias reject invalid origins before creating a connection', () => {
  for (const prefix of [['gizmo', 'dev'], ['dev']]) {
    const result = run([...prefix, '--origin', 'http://public.example.invalid']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use an HTTPS Scape origin/);
    assert.equal(result.stdout, '');
  }
});
