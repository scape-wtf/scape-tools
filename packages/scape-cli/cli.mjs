#!/usr/bin/env node
import { terminal } from './terminal.mjs';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ORIGIN = 'https://scape.wtf';

const help = `Scape CLI — gizmo projects and persistent agents

Usage:
  scape
  scape gizmo init <new-directory>
  scape gizmo dev
  scape agent run [--no-tui]
  scape agent configure
  scape agent login
  scape agent status
  scape agent memory [list|clear|enable|disable]
  scape agent memory forget <visitor-id>
  scape agent memory notes [list|clear|enable|disable]
  scape agent memory notes forget <note-id>
  scape agent init <new-directory> [--provider <name>] [--model <id>] [--base-url <url>]
  scape agent run --project <directory>
  scape agent mcp config
  scape agent mcp serve

Build Gizmos and run agents on https://scape.wtf. Gizmo development uploads changes to your private developer world.
Scape opens a full-screen agent dashboard in interactive terminals.
Agent run walks you through setup and pairing, then keeps your agent listening.
Use --no-tui on agent run for scrolling logs. Noninteractive output stays plain.
Settings and access are saved locally. Once the CLI is installed, no agent project or per-agent install step is required.
Providers: openai, anthropic, openrouter, xai, gemini, ollama, lmstudio, openai-compatible.
Agent init <directory> exports an optional project for custom agent code.
Agent mcp config/serve support interactive testing in another harness. Pairing stays separate.
Documentation: https://developer.scape.wtf`;

export async function main(args = process.argv.slice(2)) {
  if (!args.length && process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== 'dumb') {
    const { supportsDashboard } = await import('./dashboard.mjs');
    if (supportsDashboard()) {
      const { agentApplication } = await import('./agent-application.mjs');
      await agentApplication();
      return;
    }
  }
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
    const ui = terminal();
    ui.heading('Developer tools');
    console.log(help);
    return;
  }
  const commands = [
    'gizmo',
    'gizmo init',
    'gizmo dev',
    'agent',
    'agent init',
    'agent run',
    'agent configure',
    'agent login',
    'agent status',
    'agent memory',
    'agent mcp',
    'agent mcp config',
    'agent mcp serve',
    'init',
    'dev',
  ];
  if (
    ['--help', '-h'].includes(args.at(-1)) &&
    (commands.includes(args.slice(0, -1).join(' ')) || (args[0] === 'agent' && args[1] === 'run'))
  ) {
    const ui = terminal();
    ui.heading('Developer tools');
    console.log(help);
    return;
  }

  const [domain, ...rest] = args;
  if (domain === 'agent' && rest[0] === 'memory') {
    const { memoryCommand } = await import('./memory.mjs');
    await memoryCommand(rest.slice(1));
    return;
  }
  if (domain === 'agent' && rest[0] === 'init' && rest[1] && !rest[1].startsWith('--')) {
    const options = {};
    for (let i = 2; i < rest.length; i += 2) {
      const key = { '--provider': 'provider', '--model': 'model', '--base-url': 'baseUrl' }[
        rest[i]
      ];
      if (!key || !rest[i + 1] || rest[i + 1].startsWith('--') || key in options)
        throw new Error(`Unknown command or invalid arguments.\n\n${help}`);
      options[key] = rest[i + 1];
    }
    const { initAgentProject } = await import('./agent.mjs');
    const ui = terminal();
    ui.heading('Agent code project');
    const output = await initAgentProject(rest[1], options);
    ui.success(
      `Created ${output}. Run npm install there, set your provider/model and environment key, then npm run agent.`,
    );
    return;
  }
  if (
    domain === 'agent' &&
    (!rest.length || ['run', 'configure', 'login', 'status', 'init'].includes(rest[0]))
  ) {
    const command = rest[0] || 'run',
      options = {};
    for (let i = 1; i < rest.length;) {
      if (rest[i] === '--no-tui' && !('noTui' in options)) {
        options.noTui = true;
        i++;
        continue;
      }
      const key = { '--origin': 'origin', '--project': 'project' }[rest[i]];
      if (!key || !rest[i + 1] || rest[i + 1].startsWith('--') || key in options)
        throw new Error(`Unknown command or invalid arguments.\n\n${help}`);
      options[key] = rest[i + 1];
      i += 2;
    }
    if (options.project) options.origin ||= DEFAULT_ORIGIN;
    if (
      (command === 'status' && Object.keys(options).length) ||
      ((options.project || options.noTui) && command !== 'run')
    )
      throw new Error(`Unknown command or invalid arguments.\n\n${help}`);
    const { supportsDashboard } = await import('./dashboard.mjs');
    if (command === 'run' && !options.noTui && supportsDashboard()) {
      const { agentApplication } = await import('./agent-application.mjs');
      await agentApplication({ ...options, autoStart: true });
      return;
    }
    if (options.project) {
      const { runAgent } = await import('@scape-wtf/agent-mcp/runner');
      const ui = terminal();
      ui.heading('Your agent, in Scape.');
      try {
        await runAgent({
          directory: options.project,
          origin: options.origin,
          log: text => ui.line(text),
          onState: state => {
            if (state === 'thinking') ui.busy('Thinking · still listening to the world');
            else ui.clear();
          },
        });
      } finally {
        ui.close();
      }
    } else {
      const { managedAgent } = await import('./managed-agent.mjs');
      await managedAgent(command, options);
    }
    return;
  }
  const gizmoArgs = domain === 'gizmo' ? rest : args;
  if (gizmoArgs[0] === 'init' && gizmoArgs.length === 2) {
    const { initProject } = await import('./init.mjs');
    const ui = terminal();
    ui.heading('New Gizmo project');
    ui.busy('Preparing your project');
    let output;
    try {
      output = await initProject(gizmoArgs[1]);
    } finally {
      ui.clear();
    }
    ui.success(
      `Created ${output}. In that directory, run npm install, npm run build, then npm exec -- scape gizmo dev.`,
    );
    return;
  }
  if (
    gizmoArgs[0] === 'dev' &&
    (gizmoArgs.length === 1 || (gizmoArgs.length === 3 && gizmoArgs[1] === '--origin'))
  ) {
    const { dev } = await import('./gizmo.mjs');
    await dev(process.cwd(), gizmoArgs.length === 1 ? DEFAULT_ORIGIN : gizmoArgs[2]);
    return;
  }
  if (
    domain === 'agent' &&
    rest[0] === 'mcp' &&
    ['config', 'serve'].includes(rest[1]) &&
    (rest.length === 2 || (rest.length === 4 && rest[2] === '--origin'))
  ) {
    const { main: agentMain } = await import('@scape-wtf/agent-mcp/cli');
    const origin = rest.length === 2 ? DEFAULT_ORIGIN : rest[3];
    await agentMain(rest[1] === 'config' ? ['--config', origin] : [origin]);
    return;
  }
  throw new Error(`Unknown command or invalid arguments.\n\n${help}`);
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  await main().catch(error => {
    const ui = terminal({ output: process.stderr });
    ui.error(error.message);
    ui.close();
    process.exitCode = 1;
  });
}
