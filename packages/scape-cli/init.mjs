import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local kit dependencies travel with the exported kit. Yarn resolutions
// keep those archives together for source contributors.
export const kitPackages = ['scape-sdk', 'scape-cli', 'scape-agent-mcp'];

export function useKitArchives(manifest) {
  manifest.dependencies['@scape-wtf/sdk'] = 'file:vendor/scape-sdk.tgz';
  manifest.devDependencies['@scape-wtf/cli'] = 'file:vendor/scape-cli.tgz';
  manifest.resolutions = {
    ...manifest.resolutions,
    '@scape-wtf/agent-mcp': 'file:vendor/scape-agent-mcp.tgz',
  };
}

export function useRegistryPackages(manifest) {
  manifest.dependencies['@scape-wtf/sdk'] = '0.1.1';
  manifest.devDependencies['@scape-wtf/cli'] = '0.1.4';
  delete manifest.resolutions;
}

/** A new directory only: never overwrite an existing project. */
export async function initProject(destination) {
  const output = path.resolve(destination);
  await mkdir(output);
  const template = fileURLToPath(new URL('./templates/blank/', import.meta.url));
  for (const name of await readdir(template)) {
    // npm excludes .gitignore from packages; restore its name in the generated project.
    const outputName = name === 'gitignore' ? '.gitignore' : name;
    await cp(path.join(template, name), path.join(output, outputName), { recursive: true });
  }
  const manifestPath = path.join(output, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name =
    path
      .basename(output)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 60) || 'my-scape-project';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  // When invoked from an exported project, carry its local kit packages along.
  const cliRoot = fileURLToPath(new URL('./', import.meta.url));
  const candidates = [
    path.resolve(cliRoot, '../../..', 'vendor'),
    path.resolve(process.cwd(), 'vendor'),
  ];
  for (const vendor of candidates) {
    try {
      await Promise.all(kitPackages.map(name => readFile(path.join(vendor, `${name}.tgz`))));
    } catch {
      continue;
    }
    await mkdir(path.join(output, 'vendor'));
    for (const name of kitPackages)
      await cp(path.join(vendor, `${name}.tgz`), path.join(output, 'vendor', `${name}.tgz`));
    useKitArchives(manifest);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    break;
  }
  return output;
}
