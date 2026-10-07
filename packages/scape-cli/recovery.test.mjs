import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveProfile } from './profile.mjs';

for (const failure of ['http', 'socket', 'world'])
  test(
    `managed CLI explains ${failure} interruption, recovers, then exits on revocation`,
    { timeout: 15000 },
    async t => {
      const directory = await mkdtemp(path.join(tmpdir(), 'scape-recovery-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      let entries = 0,
        providerCalls = 0,
        speeches = 0,
        revoked = false;
      const observation = () => ({
        sessionId: `session-${entries}`,
        revision: 1,
        room: 'world',
        status: 'connected',
        self: { id: 'agent', text: '' },
        players: [{ id: 'visitor', text: '', settled: true }],
      });
      const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        let result = { ok: true };
        if (req.url.startsWith('/v1/')) {
          if (++providerCalls === 1 || entries === 1) {
            res.writeHead(503);
            res.end('PRIVATE_PROVIDER_ERROR');
            return;
          }
          result = {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'reply',
                      type: 'function',
                      function: {
                        name: 'scape_speak',
                        arguments: JSON.stringify({ text: 'Recovered' }),
                      },
                    },
                  ],
                },
              },
            ],
          };
        } else if (revoked) {
          res.writeHead(403);
          result = { code: 'access_revoked', error: 'Access revoked' };
        } else if (req.url.endsWith('/link/poll')) result = { approved: true, expiresAt: 0 };
        else if (req.url.endsWith('/enter')) {
          entries++;
          result = observation();
        } else if (req.url.endsWith('/observe')) {
          if (entries === 1 && failure === 'socket') {
            res.destroy();
            return;
          }
          if (entries === 1 && failure === 'world')
            result = { ...observation(), status: 'reconnecting' };
          else if (entries === 1) {
            res.writeHead(503);
            result = { code: 'unavailable', error: 'PRIVATE_SCAPE_ERROR' };
          } else result = observation();
        } else if (req.url.endsWith('/speak') && JSON.parse(body).text === 'Recovered') {
          speeches++;
          revoked = true;
        }
        res.end(JSON.stringify(result));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      t.after(() => {
        server.closeAllConnections();
        server.close();
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await saveProfile(directory, {
        version: 1,
        origin,
        config: {
          name: 'Scout',
          logging: { level: 'debug' },
          behavior: { enabled: false, checkReplies: false },
          provider: {
            type: 'openai-compatible',
            model: 'fixture',
            baseUrl: `${origin}/v1`,
            apiKeyEnv: null,
          },
          limits: { maxModelCalls: 0, minTurnIntervalMs: 500 },
        },
        grant: { origin, name: 'Scout', token: 'FIXTURE_GRANT' },
      });
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'agent', 'run'],
        {
          env: { ...process.env, SCAPE_CLI_HOME: directory },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      t.after(() => child.kill('SIGKILL'));
      let output = '';
      child.stdout.on('data', value => (output += value));
      child.stderr.on('data', value => (output += value));
      const result = await new Promise(resolve =>
        child.on('exit', (code, signal) => resolve({ code, signal })),
      );
      assert.deepEqual(result, { code: 1, signal: null }, output);
      assert.equal(entries, 2, output);
      assert.equal(speeches, 1, output);
      assert.ok(providerCalls >= 2, output);
      assert.match(output, /connection interrupted/i);
      if (failure === 'http') {
        assert.match(output, /unavailable.*observe.*HTTP 503/);
        assert.match(output, /Scape service is temporarily unavailable/);
      } else if (failure === 'socket') {
        assert.match(output, /connection_lost.*observe.*(?:socket_closed|connection_reset)/);
      } else {
        assert.match(output, /connection_lost.*observe.*world_reconnecting/);
        assert.match(output, /backend connection to the world is reconnecting/);
      }
      assert.match(output, /\d{4}-\d{2}-\d{2}T.*Z Scape connection interrupted/);
      assert.match(output, /Conversation provider unavailable.*provider_http_error.*HTTP 503/i);
      assert.match(output, /\[debug\] conversation_request phase=start/);
      assert.match(output, /\[debug\] conversation_request phase=failed.*status=503/);
      assert.match(output, /\[debug\] tool_call.*outcome=success/);
      assert.doesNotMatch(output, /FIXTURE_GRANT|PRIVATE_PROVIDER_ERROR|PRIVATE_SCAPE_ERROR/);
    },
  );
