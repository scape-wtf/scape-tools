import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const until = async check => {
  for (let i = 0; i < 160; i++) {
    if (check()) return;
    await delay(50);
  }
  throw new Error('Agent test timed out');
};

test('registry installation creates an agent project with current public dependencies', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scape-agent-registry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['cli.mjs', 'agent.mjs', 'terminal.mjs']) {
    await cp(new URL(`./${name}`, import.meta.url), path.join(directory, name));
  }
  // Supply installed dependencies without the source-workspace or kit markers.
  const dependencyDirectory = fileURLToPath(new URL('../../node_modules', import.meta.url));
  await symlink(dependencyDirectory, path.join(directory, 'node_modules'), 'dir');
  const project = path.join(directory, 'Scout');
  const result = spawnSync(
    process.execPath,
    [
      path.join(directory, 'cli.mjs'),
      'agent',
      'init',
      project,
      '--provider',
      'openrouter',
      '--model',
      'fixture',
    ],
    { cwd: directory, encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, {
    '@scape-wtf/cli': '0.1.4',
    '@scape-wtf/agent-mcp': '0.1.3',
  });
  assert.equal(manifest.resolutions, undefined);
  assert.equal(existsSync(path.join(project, 'vendor')), false);
});

test('agent init creates an installable private kit, configuration and secret-free environment template', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'scape-agent-init-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const project = path.join(temp, 'Scout');
  const args = ['agent', 'init', project, '--provider', 'openrouter', '--model', 'fixture-model'];
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, OPENROUTER_API_KEY: 'SECRET_DO_NOT_COPY' },
  });
  assert.equal(result.status, 0, result.stderr);
  const original = await readFile(path.join(project, 'scape.agent.json'), 'utf8');
  const config = JSON.parse(original);
  assert.equal(config.provider.type, 'openrouter');
  assert.equal(config.provider.model, 'fixture-model');
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.agent, 'scape agent run --project .');
  assert.equal(manifest.dependencies['@scape-wtf/cli'], 'file:vendor/scape-cli.tgz');
  assert.deepEqual((await readdir(path.join(project, 'vendor'))).sort(), [
    'scape-agent-mcp.tgz',
    'scape-cli.tgz',
  ]);
  assert.match(await readFile(path.join(project, '.env.example'), 'utf8'), /OPENROUTER_API_KEY=\n/);
  assert.ok(!original.includes('SECRET_DO_NOT_COPY'));
  assert.equal(
    spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 }).status,
    1,
  );
  assert.equal(await readFile(path.join(project, 'scape.agent.json'), 'utf8'), original);
});

for (const variant of ['provider', 'custom', 'moss', 'limited'])
  test(
    `CLI runner pairs through MCP, replies with ${variant} and leaves on SIGINT`,
    {
      timeout: 20000,
      skip:
        variant === 'moss' &&
        !existsSync(fileURLToPath(new URL('../moss-agent/src/cli.ts', import.meta.url))),
    },
    async t => {
      const custom = variant === 'custom',
        limited = variant === 'limited';
      const temp = await mkdtemp(path.join(tmpdir(), 'scape-agent-run-'));
      t.after(() => rm(temp, { recursive: true, force: true }));
      let requests = 0,
        speaks = 0,
        leaves = 0,
        observes = 0,
        modelBody = '';
      const failures = [];
      const observation = {
        protocol: 1,
        sessionId: 'fixture',
        revision: 1,
        observedAt: 1,
        room: 'world',
        status: 'connected',
        self: { id: 'agent', name: 'Scout', x: 1, y: 1, floor: 0, text: '' },
        players: [
          {
            id: 'human',
            name: 'Human',
            x: 2,
            y: 1,
            floor: 0,
            text: '',
            textRevision: 1,
            settled: true,
          },
        ],
        roster: [{ id: 'human', name: 'Human', x: 2, y: 1, floor: 0 }],
        objects: [],
        blocked: [],
        movement: null,
        limits: { radius: 10, heartbeatMs: 250, idleTimeoutMs: 15000, maxSpeechLength: 320 },
      };
      const server = http.createServer(async (req, res) => {
        try {
          let text = '';
          for await (const chunk of req) text += chunk;
          const body = JSON.parse(text);
          let result = { ok: true };
          if (req.url === '/v1/chat/completions') {
            if (body.tools?.some(t => t.function?.name === 'agent_review_reply')) {
              assert.equal(req.headers.authorization, 'Bearer MODEL_SECRET');
              assert.doesNotMatch(text, /GRANT_SECRET|MODEL_SECRET/);
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  choices: [
                    {
                      finish_reason: 'tool_calls',
                      message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                          {
                            id: 'review',
                            type: 'function',
                            function: {
                              name: 'agent_review_reply',
                              arguments: JSON.stringify({ grounded: true, relevant: true }),
                            },
                          },
                        ],
                      },
                    },
                  ],
                }),
              );
              return;
            }
            requests++;
            modelBody += text;
            assert.equal(req.headers.authorization, 'Bearer MODEL_SECRET');
            assert.ok(!text.includes('GRANT_SECRET'));
            assert.ok(!text.includes('MODEL_SECRET'));
            const tool = limited || requests % 2 === 1;
            result = {
              choices: [
                {
                  finish_reason: tool ? 'tool_calls' : 'stop',
                  message: {
                    role: 'assistant',
                    content: tool ? null : 'Done',
                    ...(tool
                      ? {
                          tool_calls: [
                            {
                              id: `call-${requests}`,
                              type: 'function',
                              function: {
                                name: limited && requests % 2 === 0 ? 'scape_guide' : 'scape_speak',
                                arguments: JSON.stringify(
                                  limited && requests % 2 === 0
                                    ? {}
                                    : { text: `Reply ${requests}` },
                                ),
                              },
                            },
                          ],
                        }
                      : {}),
                  },
                },
              ],
            };
          } else {
            if (req.url !== '/api/agents/link/start')
              assert.equal(req.headers.authorization, 'Bearer GRANT_SECRET');
            assert.notEqual(req.headers.authorization, 'Bearer MODEL_SECRET');
            if (req.url === '/api/agents/link/start')
              result = {
                secret: 'GRANT_SECRET',
                code: 'TESTCODE12345678',
                expiresAt: Date.now() + 300000,
              };
            if (req.url === '/api/agents/link/poll') result = { approved: true };
            if (req.url === '/api/agents/enter' || req.url === '/api/agents/observe') {
              result = observation;
              observes++;
            }
            if (req.url === '/api/agents/speak') {
              if (body.text && body.text !== '…') speaks++;
              observation.self.text = body.text;
              observation.revision++;
            }
            if (req.url === '/api/agents/leave') leaves++;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (error) {
          failures.push(error);
          res.writeHead(500);
          res.end('{}');
        }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      t.after(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await writeFile(
        path.join(temp, 'scape.agent.json'),
        JSON.stringify(
          custom
            ? { name: 'Scout', policy: './my-policy.mjs' }
            : {
                name: 'Scout',
                provider: {
                  type: 'openai-compatible',
                  model: 'fixture',
                  baseUrl: origin + '/v1',
                  apiKeyEnv: 'SCAPE_FIXTURE_MODEL_KEY',
                },
                limits: { minTurnIntervalMs: 500, ...(limited ? { maxToolRounds: 2 } : {}) },
              },
        ),
      );
      if (custom)
        await writeFile(
          path.join(temp, 'my-policy.mjs'),
          `export default context=>({async onTurn({events}){if(events.some(e=>e.type==='ready'||e.type==='speech'))await context.tools.call('scape_speak',{text:'Custom reply'});}});\n`,
        );
      await writeFile(path.join(temp, '.env'), 'SCAPE_FIXTURE_MODEL_KEY=MODEL_SECRET\n');
      const env = { ...process.env };
      delete env.SCAPE_AGENT_TOKEN;
      delete env.SCAPE_FIXTURE_MODEL_KEY;
      delete env.SCAPE_AGENT_ASSET_DIR;
      const command =
        variant === 'moss'
          ? [
              '--import',
              import.meta.resolve('tsx'),
              fileURLToPath(new URL('../moss-agent/src/cli.ts', import.meta.url)),
              origin,
            ]
          : [cli, 'agent', 'run', '--project', temp, '--origin', origin];
      if (variant === 'moss') {
        env.MOSS_PROVIDER = 'openai-compatible';
        env.MOSS_MODEL = 'fixture';
        env.MOSS_BASE_URL = origin + '/v1';
        env.SCAPE_MODEL_API_KEY = 'MODEL_SECRET';
      }
      const child = spawn(process.execPath, command, {
        cwd: temp,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
      });
      child.stderr.on('data', chunk => {
        output += chunk;
      });
      t.after(() => child.kill('SIGKILL'));
      const exited = new Promise(resolve =>
        child.once('exit', (code, signal) => resolve({ code, signal })),
      );
      await until(() => speaks === 1 && requests === (custom ? 0 : 2));
      observation.players[0] = { ...observation.players[0], text: 'Hello again', textRevision: 2 };
      observation.revision++;
      await until(() => speaks === 2 && requests === (custom ? 0 : 4));
      const count = observes;
      await until(() => observes > count + 2);
      assert.equal(requests, custom ? 0 : 4, 'idle observations do not call the model');
      assert.equal(leaves, 0, 'tool-round exhaustion must not withdraw the agent');
      if (limited) assert.match(output, /Paused after 2 tool rounds.*still listening/);
      child.kill('SIGINT');
      assert.deepEqual(await exited, { code: 0, signal: null });
      assert.ok(leaves >= 1);
      assert.deepEqual(failures, []);
      assert.match(output, /TESTCODE12345678/);
      if (!custom) assert.ok(modelBody.includes('Hello again'));
      assert.doesNotMatch(output, /MODEL_SECRET|GRANT_SECRET/);
    },
  );

test(
  'persistent runner uses separate decision inference for movement, then conversation for a reply through MCP',
  { timeout: 20000 },
  async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'scape-decision-run-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let decisions = 0,
      conversations = 0,
      approaches = 0,
      leaves = 0,
      observations = 0;
    const errors = [];
    const observation = {
      protocol: 1,
      sessionId: 'fixture',
      revision: 1,
      observedAt: 1,
      room: 'world',
      status: 'connected',
      self: { id: 'agent', name: 'Scout', x: 1, y: 1, floor: 0, text: '' },
      players: [
        {
          id: 'human',
          name: 'Human',
          x: 4,
          y: 1,
          floor: 0,
          text: '',
          textRevision: 1,
          settled: true,
        },
      ],
      roster: [{ id: 'human', name: 'Human', x: 4, y: 1, floor: 0 }],
      objects: [],
      blocked: [],
      movement: null,
      limits: { radius: 10, heartbeatMs: 250, idleTimeoutMs: 15000, maxSpeechLength: 320 },
    };
    const server = http.createServer(async (req, res) => {
      try {
        let text = '';
        for await (const chunk of req) text += chunk;
        const body = JSON.parse(text);
        let result = { ok: true };
        assert.doesNotMatch(text, /GRANT_SECRET|DECISION_SECRET|CHAT_SECRET/);
        if (req.url === '/decision') {
          decisions++;
          assert.equal(req.headers.authorization, 'Bearer DECISION_SECRET');
          result = {
            answers: Object.fromEntries(
              Object.keys(body.questions).map(key => [
                key,
                {
                  type: 'choice',
                  choice: key.endsWith('_action')
                    ? body.state.speakers[0].text.includes('closer')
                      ? 'approach'
                      : 'reply'
                    : key.endsWith('_tone')
                      ? 'neutral'
                      : key === 'mood'
                        ? 'warm'
                        : 'stay',
                },
              ]),
            ),
          };
        } else if (req.url === '/v1/chat/completions') {
          conversations++;
          assert.equal(req.headers.authorization, 'Bearer CHAT_SECRET');
          result = {
            choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }],
          };
        } else {
          assert.equal(req.headers.authorization, 'Bearer GRANT_SECRET');
          if (req.url === '/api/agents/link/poll') result = { approved: true };
          if (req.url === '/api/agents/enter' || req.url === '/api/agents/observe') {
            result = observation;
            observations++;
          }
          if (req.url === '/api/agents/speak') {
            observation.self.text = body.text;
            observation.revision++;
          }
          if (req.url === '/api/agents/approach') {
            approaches++;
            assert.equal(body.player, 'human');
          }
          if (req.url === '/api/agents/leave') leaves++;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch (error) {
        errors.push(error);
        res.writeHead(500);
        res.end('{}');
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await writeFile(
      path.join(directory, 'scape.agent.json'),
      JSON.stringify({
        name: 'Scout',
        provider: {
          type: 'openai-compatible',
          model: 'chat',
          baseUrl: origin + '/v1',
          apiKeyEnv: 'SCAPE_TEST_CHAT',
        },
        decision: {
          type: 'system-one',
          model: 'decide',
          baseUrl: origin + '/decision',
          apiKeyEnv: 'SCAPE_TEST_DECISION',
          minIntervalMs: 250,
        },
        limits: { minTurnIntervalMs: 500 },
      }),
    );
    const child = spawn(
      process.execPath,
      [cli, 'agent', 'run', '--project', directory, '--origin', origin],
      {
        env: {
          ...process.env,
          SCAPE_AGENT_TOKEN: 'GRANT_SECRET',
          SCAPE_TEST_CHAT: 'CHAT_SECRET',
          SCAPE_TEST_DECISION: 'DECISION_SECRET',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', c => (output += c));
    child.stderr.on('data', c => (output += c));
    t.after(() => child.kill('SIGKILL'));
    const exit = new Promise(resolve =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    );
    await until(() => observations >= 2);
    observation.players[0] = {
      ...observation.players[0],
      text: 'Scout, come closer please',
      textRevision: 2,
    };
    observation.revision++;
    await until(() => approaches === 1);
    assert.equal(conversations, 0);
    observation.players[0] = {
      ...observation.players[0],
      text: 'Scout, how are you?',
      textRevision: 3,
    };
    observation.revision++;
    await until(() => conversations === 1);
    assert.equal(decisions, 2);
    child.kill('SIGINT');
    assert.deepEqual(await exit, { code: 0, signal: null });
    assert.ok(leaves >= 1);
    assert.deepEqual(errors, []);
    assert.doesNotMatch(output, /GRANT_SECRET|DECISION_SECRET|CHAT_SECRET/);
  },
);
