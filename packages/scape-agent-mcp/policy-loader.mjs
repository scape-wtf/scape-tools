import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Intentional extension boundary: only the owner's project config selects this module. */
export async function loadOwnerModule(directory, filename) {
  return (await import(pathToFileURL(path.resolve(directory,filename)).href)).default;
}
export async function loadAgentPolicy(directory, filename) {
  let factory;
  try { factory = await loadOwnerModule(directory, filename); }
  catch { throw new Error('Cannot load the custom policy module. Check its path and imports.'); }
  if (typeof factory !== 'function') throw new Error('The custom policy must export a default createAgent function.');
  return factory;
}
