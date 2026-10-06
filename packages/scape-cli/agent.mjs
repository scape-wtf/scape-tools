import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { terminal } from './terminal.mjs';
import { providerPresets } from '@scape-wtf/agent-mcp/runner';
const exec = promisify(execFile);

export async function initAgentProject(destination, options = {}) {
  const choices = { ...options };
  const ui = terminal();
  if (ui.tty) {
    choices.provider ??= await ui.choose(
      'Model provider',
      Object.keys(providerPresets).map(value => ({ value, label: value })),
    );
    choices.model ??= await ui.ask('Tool-capable model ID');
    if (choices.provider === 'openai-compatible')
      choices.baseUrl ??= await ui.ask('Provider API base URL');
  }
  if (choices.provider && !Object.hasOwn(providerPresets, choices.provider))
    throw new Error(`Choose a provider: ${Object.keys(providerPresets).join(', ')}.`);
  if (choices.baseUrl && choices.provider !== 'openai-compatible')
    throw new Error('--base-url is for openai-compatible providers.');
  const provider = choices.provider || 'openai-compatible';
  const defaults = providerPresets[provider];
  const output = path.resolve(destination),
    cliRoot = fileURLToPath(new URL('./', import.meta.url));
  // Resolve distribution before creating anything. Source/kit users get archives;
  // globally installed users get registry dependencies.
  let vendor;
  const packages = ['scape-cli', 'scape-agent-mcp'];
  for (const candidate of [
    path.resolve(cliRoot, '../../..', 'vendor'),
    path.resolve(process.cwd(), 'vendor'),
  ]) {
    try {
      await Promise.all(packages.map(name => readFile(path.join(candidate, `${name}.tgz`))));
      vendor = candidate;
      break;
    } catch {}
  }
  const repoRoot = path.resolve(cliRoot, '../..');
  const sourceWorkspace =
    !vendor &&
    (await readFile(path.join(repoRoot, 'tools/dev/agent-contracts.mjs'))
      .then(() => true)
      .catch(() => false));
  await mkdir(output);
  if (vendor || sourceWorkspace) {
    await mkdir(path.join(output, 'vendor'));
    for (const name of packages) {
      const target = path.join(output, 'vendor', `${name}.tgz`);
      if (vendor) await cp(path.join(vendor, `${name}.tgz`), target);
      else {
        try {
          const packageDirectory = path.join(repoRoot, 'packages', name);
          const result = await exec(
            'npm',
            ['pack', '--json', '--ignore-scripts', '--pack-destination', path.dirname(target)],
            { cwd: packageDirectory, maxBuffer: 2_000_000 },
          );
          const packed = JSON.parse(result.stdout)[0].filename;
          await rename(path.join(path.dirname(target), packed), target);
        } catch {
          throw new Error(
            'Could not package the agent kit. Check the source workspace dependencies.',
          );
        }
      }
    }
  }
  const config = {
    name:
      path
        .basename(output)
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .slice(0, 24) || 'My agent',
    instructions:
      'Be a friendly world companion. Respond when addressed, respect requests for space, and use the handbook when explaining the world.',
    avatar: { kind: 'emoji', emoji: '🤖' },
    provider: {
      type: provider,
      model: choices.model || '',
      ...(provider === 'openai-compatible' ? { baseUrl: choices.baseUrl || '' } : {}),
      apiKeyEnv: defaults.apiKeyEnv,
    },
    limits: {
      turnTimeoutMs: 60000,
      maxToolRounds: 8,
      maxOutputTokens: 2048,
      historyTurns: 4,
      maxModelCalls: 200,
      minTurnIntervalMs: 5000,
    },
  };
  const dependencies =
    vendor || sourceWorkspace
      ? {
          '@scape-wtf/cli': 'file:vendor/scape-cli.tgz',
          '@scape-wtf/agent-mcp': 'file:vendor/scape-agent-mcp.tgz',
        }
      : { '@scape-wtf/cli': '0.1.4', '@scape-wtf/agent-mcp': '0.1.3' };
  const manifest = {
    name:
      path
        .basename(output)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 60) || 'my-agent',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { agent: 'scape agent run --project .' },
    dependencies,
    ...(vendor || sourceWorkspace
      ? { resolutions: { '@scape-wtf/agent-mcp': 'file:vendor/scape-agent-mcp.tgz' } }
      : {}),
  };
  await writeFile(path.join(output, 'scape.agent.json'), JSON.stringify(config, null, 2) + '\n');
  await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(
    path.join(output, '.gitignore'),
    'node_modules/\n.scape-memory/\n.env\n.env.*\n!.env.example\n',
  );
  await writeFile(
    path.join(output, '.env.example'),
    defaults.apiKeyEnv
      ? `# Copy to .env and set your own provider key. Never commit .env.\n${defaults.apiKeyEnv}=\n`
      : '# No API key required by default. Keep your local server bound to loopback.\n',
  );
  await writeFile(
    path.join(output, 'README.md'),
    `# ${config.name}\n\nRun npm install, configure provider/model in scape.agent.json, and copy .env.example to .env with your provider key. For a local provider without authentication, set provider.apiKeyEnv to null.\n\nStart: npm run agent\n\nApprove the printed code in Scape Settings → Developer → Agents and choose any public world (including Commons) or a world you own. The developer sidebar targets your current developer world. Keep the process running; Ctrl+C leaves.\n\nThis runner uses public MCP tools, keeps listening between responses and makes no model calls while alone. Model calls incur your provider's normal charges. limits.maxModelCalls defaults to 200; set it to 0 for unlimited requests. A nonzero limit stops the run when exhausted; it is not a currency budget. Failed requests and private reply checks count toward that limit. Per-turn timeouts, output and tool-round limits remain in effect.\n\nConversation-provider failures and turn timeouts retry while listening. Temporary observation/connection failures re-enter with fresh context and cancel old decisions; backoff grows from one to thirty seconds. Sleeping and reconnecting do not reset the request count. Revocation, sign-out or expiry of the approving account session, bans and loss of world access stop the process. Making a public world private ends access unless you own it.\n\nPairing codes last five minutes. New approved grants have no time expiry; existing finite grants need one new pairing. Scape does not host the process or install a background service.\n\nChange name, avatar and instructions to make the agent your own. Optional policy points to a trusted local module exporting createAgent(context); this replaces the built-in model policy. Provider settings, request limits and provider retry behavior then belong to that policy; the CLI still manages connection recovery. Credentials remain in your process.\n\nThis project uses the public Scape packages unless it was created from a local development kit. Guide: https://developer.scape.wtf/agents/quickstart\n`,
  );
  return output;
}
