import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Compile before touching the output served by Vite. Unchanged bytes must keep
// their inode and timestamp so validation builds do not reload the live game.
const cwd = process.cwd();
const configPath = path.join(cwd, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) fail([config.error]);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, cwd);
if (parsed.errors.length) fail(parsed.errors);
const outputRoot = path.join(cwd, 'dist');
if (parsed.options.outDir !== outputRoot) throw new Error('Package builds must emit into their own dist directory');

const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmitOnError: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.some(item => item.category === ts.DiagnosticCategory.Error)) fail(diagnostics);
const outputs = new Map();
const emitted = program.emit(undefined, (filename, text, bom) => {
  const target = path.resolve(filename);
  if (!target.startsWith(`${outputRoot}${path.sep}`)) throw new Error(`Output outside dist: ${target}`);
  outputs.set(target, Buffer.from(`${bom ? '\uFEFF' : ''}${text}`));
});
if (emitted.emitSkipped || emitted.diagnostics.some(item => item.category === ts.DiagnosticCategory.Error)) {
  fail(emitted.diagnostics);
}
if (!outputs.size) throw new Error('Package compilation produced no output');

// Create new modules before replacing existing importers. Each replacement is
// atomic: a reader sees the old file or the complete new file, never a gap.
const additions = [], changes = [];
for (const [target, bytes] of outputs) {
  try {
    if (!(await readFile(target)).equals(bytes)) changes.push([target, bytes]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    additions.push([target, bytes]);
  }
}
for (const [target, bytes] of [...additions, ...changes]) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.scape-build-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
// Only prune obsolete output after a successful compile and publication.
await prune(outputRoot);

async function prune(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.scape-build-')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await prune(filename);
    else if (!outputs.has(filename)) await rm(filename);
  }
}

function fail(diagnostics) {
  const host = {
    getCanonicalFileName: filename => filename,
    getCurrentDirectory: () => cwd,
    getNewLine: () => '\n',
  };
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  process.exit(1);
}
