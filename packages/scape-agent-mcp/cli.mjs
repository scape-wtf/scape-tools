#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ScapeAgent } from './transport.mjs';
import { createScapeMcpServer } from './server.mjs';

export async function main(argv = process.argv.slice(2)) {
  const args = [...argv];
  const config = args[0] === '--config'; if (config) args.shift();
  const [origin, ...extra] = args;
  if (!origin || extra.length) {
    console.error('Usage: node packages/scape-agent-mcp/cli.mjs [--config] https://your-scape-server');
    process.exitCode = 1;
  } else {
    const apps = new Set(); let handle, closing;
    const close = () => closing ??= (async () => {
      const deadline = setTimeout(() => process.exit(1), 12_000); deadline.unref();
      try { await Promise.all([...apps].map(app => app.close())); await handle?.close(); }
      finally { clearTimeout(deadline); process.stdin.destroy(); }
    })();
    try {
      // Origin is operator configuration, never a model tool argument.
      new ScapeAgent({ origin });
      if (config) {
        console.log(JSON.stringify({ mcpServers: { scape: { command: process.execPath,
          args: [fileURLToPath(import.meta.url), origin], ...(process.env.SCAPE_AGENT_ASSET_DIR?{env:{SCAPE_AGENT_ASSET_DIR:process.env.SCAPE_AGENT_ASSET_DIR}}:{}) } } }, null, 2));
      } else {
        handle = serveStdio(() => {
          const app = createScapeMcpServer({ origin, token: process.env.SCAPE_AGENT_TOKEN, assetDirectory:process.env.SCAPE_AGENT_ASSET_DIR });
          apps.add(app); return app.server;
        }, { onerror: () => console.error('Scape MCP protocol error.') });
        process.stdin.once('end', () => { void close(); });
        process.once('SIGINT', () => { void close(); });
        process.once('SIGTERM', () => { void close(); });
      }
    } catch {
      console.error('Cannot start Scape MCP. Use an HTTPS origin or loopback HTTP, and install the adapter dependencies.');
      process.exitCode = 1; void close();
    }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
