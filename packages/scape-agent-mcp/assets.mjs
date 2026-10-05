import { realpath, readdir, open } from 'node:fs/promises';
import path from 'node:path';
const valid = name =>
  typeof name === 'string' && /^[\w .-]{1,100}\.(?:glb|png|jpe?g|webp)$/i.test(name);
/** The operator selects one avatar directory. Tool arguments never grant filesystem access. */
export function avatarFiles(directory) {
  const root = async () => {
    if (!directory)
      throw new Error('Set SCAPE_AGENT_ASSET_DIR to your avatar folder in the MCP configuration.');
    return realpath(directory);
  };
  return {
    async list() {
      if (!directory) return { assets: [] };
      const entries = await readdir(await root(), { withFileTypes: true });
      return {
        assets: entries
          .filter(e => e.isFile() && valid(e.name))
          .slice(0, 100)
          .map(e => e.name),
      };
    },
    async read(name, kind) {
      if (!valid(name) || (kind === 'glb') !== name.toLowerCase().endsWith('.glb'))
        throw new Error('Choose an available avatar file of the matching type.');
      const base = await root(),
        filename = await realpath(path.join(base, name));
      if (path.dirname(filename) !== base)
        throw new Error('Avatar must be inside the configured folder.');
      const file = await open(filename, 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 512 * 1024)
          throw new Error('Avatar file exceeds 512 KiB.');
        const bytes = Buffer.alloc(512 * 1024 + 1);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 512 * 1024) throw new Error('Avatar file exceeds 512 KiB.');
        return bytes.subarray(0, bytesRead).toString('base64');
      } finally {
        await file.close();
      }
    },
  };
}
