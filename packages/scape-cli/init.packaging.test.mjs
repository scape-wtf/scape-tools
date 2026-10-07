import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('BUG-182: npm-packed CLI scaffolds ignored output without leaking the template filename', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-cli-npm-pack-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const packed = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'pack',
      '--workspace=@scape-wtf/cli',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      directory,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const [report] = JSON.parse(packed.stdout);
  const extracted = spawnSync(
    'tar',
    ['-xzf', path.join(directory, report.filename), '-C', directory],
    {
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.equal(extracted.status, 0, extracted.stderr);
  const { initProject } = await import(
    pathToFileURL(path.join(directory, 'package/init.mjs')).href
  );
  const output = path.join(directory, 'new-project');
  await initProject(output);
  assert.equal(await readFile(path.join(output, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
  assert.ok(!(await readdir(output)).includes('gitignore'));
  await assert.rejects(initProject(output), { code: 'EEXIST' });
  assert.equal(await readFile(path.join(output, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n');
});
