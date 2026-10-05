import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile, readdir, chmod, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { terminal } from './terminal.mjs';
import { configureProfile, managedAgent } from './managed-agent.mjs';
import { readProfile, saveProfile, lockProfile, runningProfile } from './profile.mjs';
import { parseAgentConfig, pairAgent } from '@scape-wtf/agent-mcp/runner';
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
async function temp(t) { const dir = await mkdtemp(path.join(tmpdir(), 'scape-managed-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
function fakeUI(answers = {}) {
  const lines = []; return { tty: true, lines,
    ask: async (label, options) => { const value = Object.hasOwn(answers, label) ? answers[label] : options.value || ''; if (options.required !== false && !value) throw new Error(`Missing fixture answer: ${label}`); await options.validate?.(value); return value; },
    choose: async (label, choices, current) => answers[label] || current || choices[0].value,
    line: v => lines.push(v), heading: v => lines.push(v), step: (_, v) => lines.push(v), busy: v => lines.push(v), success: v => lines.push(v), clear() {}, close() {},
  };
}
const config = () => parseAgentConfig({ name: 'Scout', provider: { type: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: 'fixture', apiKeyEnv: null } });

test('guided configuration saves a private profile without projects, installs or secret output', async t => {
  const directory = await temp(t);
  const ui = fakeUI({ 'Model provider': 'openrouter', 'Tool-capable model ID': 'fixture-model', 'API key (hidden)': 'PROVIDER_SECRET' });
  const profile = await configureProfile({ directory, ui, env: {} });
  assert.equal(profile.providerKey, 'PROVIDER_SECRET');
  assert.equal(profile.config.name, 'Scout'); assert.equal(profile.origin, 'https://scape.wtf');
  assert.deepEqual(await readdir(directory), ['agent.json']);
  assert.equal((await readProfile(directory)).providerKey, 'PROVIDER_SECRET');
  if (process.platform !== 'win32') { assert.equal((await stat(directory)).mode & 0o777, 0o700); assert.equal((await stat(path.join(directory, 'agent.json'))).mode & 0o777, 0o600); }
  assert.doesNotMatch(ui.lines.join('\n'), /PROVIDER_SECRET/);
  const cancelled = { ...ui, ask: async () => { throw new Error('cancel'); } };
  await assert.rejects(configureProfile({ previous: profile, directory, ui: cancelled }), /cancel/);
  assert.deepEqual(await readProfile(directory), profile);
});

test('changing endpoint discards provider key and changing Scape host discards grant', async t => {
  const directory = await temp(t);
  const previous = { version: 1, config: config(), origin: 'https://old.example', providerKey: 'OLD_SECRET', grant: { origin: 'https://old.example', name: 'Scout', token: 'OLD_GRANT' } };
  const ui = fakeUI({ 'API base URL': 'http://localhost:2345/v1', 'Provider credentials': 'none' });
  const next = await configureProfile({ previous, directory, origin: 'https://new.example', ui, env: {} });
  assert.equal(next.providerKey, undefined); assert.equal(next.grant, undefined);
  assert.doesNotMatch(await readFile(path.join(directory, 'agent.json'), 'utf8'), /OLD_SECRET|OLD_GRANT/);
});

test('one owner process per profile; dead process locks recover and status is read-only', async t => {
  const directory = await temp(t), release = await lockProfile(directory);
  assert.equal((await runningProfile(directory)).pid, process.pid);
  await assert.rejects(lockProfile(directory), /already running/); await release();
  await writeFile(path.join(directory, 'agent.lock'), JSON.stringify({ pid: 2147483647, id: 'dead' }));
  const again = await lockProfile(directory); await again(); assert.equal(await runningProfile(directory), undefined);
  const ui = fakeUI(); await managedAgent('status', { directory, ui });
  assert.match(ui.lines.join('\n'), /No agent configured/);
  assert.deepEqual(await readdir(directory), []);
});

test('terminal hides typed keys, sanitizes terminal controls and uses plain output for NO_COLOR', async () => {
  const input = new PassThrough(); input.isTTY = true; input.setRawMode = () => {};
  let outputText = ''; const output = new Writable({ write(data, _, done) { outputText += data; done(); } }); output.isTTY = true; output.columns = 30;
  const ui = terminal({ input, output, env: { TERM: 'xterm', NO_COLOR: '' } });
  const answer = ui.ask('API key', { secret: true });
  input.write('HIDDEN_SECRET\r');
  assert.equal(await answer, 'HIDDEN_SECRET');
  ui.heading('Agent'); ui.busy('Connecting'); ui.line('unsafe\x1b[2Jvalue'); ui.close();
  assert.doesNotMatch(outputText, /HIDDEN_SECRET|\x1b/);
  assert.match(outputText, /Scape/); assert.match(outputText, /Connecting/);
  input.destroy();
});

test('pairing expires without entering a world or revealing its bearer', async t => {
  const server = http.createServer((req, res) => { assert.equal(req.url, '/api/agents/link/start'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ secret: 'HIDDEN_GRANT', code: 'EXPIRED', expiresAt: Date.now() - 1 })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  let code;
  await assert.rejects(pairAgent({ origin: `http://127.0.0.1:${server.address().port}`, name: 'Scout', onCode: value => { code = value; } }), /expired/);
  assert.deepEqual(Object.keys(code).sort(), ['code','expiresAt']);
});

test('saved profile runs from any directory, reuses approval, reports status and shuts down through MCP', { timeout: 20000 }, async t => {
  const directory = await temp(t); let entered = 0, left = 0, calls = 0, paired = 0; const failures = [];
  const observation = { protocol: 1, sessionId: 'saved-session', revision: 1, observedAt: 1, room: 'world', status: 'connected', self: { id: 'agent', name: 'Scout', x: 1, y: 1, floor: 0, text: '' }, players: [], roster: [], objects: [], blocked: [], movement: null, limits: { radius: 10, heartbeatMs: 250, idleTimeoutMs: 15000, maxSpeechLength: 320 } };
  const server = http.createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      if (req.url !== '/api/agents/link/start') assert.equal(req.headers.authorization, 'Bearer SAVED_GRANT'); assert.ok(!body.includes('PROVIDER_SECRET'));
      calls++; let result = { ok: true };
      if (req.url === '/api/agents/link/start') { paired++; result = { secret: 'SAVED_GRANT', code: 'APPROVECODE', expiresAt: Date.now() + 300000 }; }
      if (req.url === '/api/agents/link/poll') result = { approved: true, room: 'world' };
      if (req.url === '/api/agents/enter') { entered++; result = observation; }
      if (req.url === '/api/agents/observe') result = observation;
      if (req.url === '/api/agents/leave') left++;
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(result));
    } catch (error) { failures.push(error); res.writeHead(500); res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await saveProfile(directory, { version: 1, origin, config: config(), providerKey: 'PROVIDER_SECRET' });
  const ui = fakeUI(); await managedAgent('login', { directory, ui });
  assert.equal(entered, 0); assert.equal((await readProfile(directory)).grant.token, 'SAVED_GRANT');
  const afterLogin = calls; await managedAgent('status', { directory, ui }); assert.equal(entered, 0); assert.equal(calls, afterLogin + 1);
  assert.doesNotMatch(ui.lines.join('\n'), /SAVED_GRANT|PROVIDER_SECRET/);
  for (let run = 0; run < 2; run++) {
    const child = spawn(process.execPath, [cli, 'agent', 'run'], { cwd: tmpdir(), env: { ...process.env, SCAPE_CLI_HOME: directory, SCAPE_AGENT_TOKEN: 'UNRELATED_GRANT' }, stdio: ['ignore','pipe','pipe'] });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c); t.after(() => child.kill('SIGKILL'));
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    for (let i = 0; i < 120 && !output.includes('is running'); i++) await delay(50);
    assert.match(output, /is running/, output); child.kill('SIGINT'); assert.deepEqual(await exited, { code: 0, signal: null });
    assert.doesNotMatch(output, /SAVED_GRANT|PROVIDER_SECRET|UNRELATED_GRANT/);
  }
  assert.equal(entered, 2); assert.equal(paired, 1); assert.ok(left >= 2); assert.deepEqual(failures, []);
});

test('terminal prompts retain their labels and cancellation restores input without exposing a key', async () => {
  const input = new PassThrough(); input.isTTY = true; let raw = false; input.setRawMode = value => { raw = value; };
  let transcript = ''; const output = new Writable({ write(chunk, _, done) { transcript += chunk; done(); } }); output.isTTY = true; output.columns = 44;
  const ui = terminal({ input, output, env: { TERM: 'xterm', SCAPE_REDUCED_MOTION: '1' } });
  const answer = ui.ask('Agent name', { value: 'Scout' }); input.write('\r'); assert.equal(await answer, 'Scout');
  assert.match(transcript, /Agent name/); assert.equal(raw, false);
  const secret = ui.ask('API key', { secret: true }); input.write('PARTIAL_SECRET'); ui.cancel();
  await assert.rejects(secret, /Stopped/); assert.equal(raw, false); assert.doesNotMatch(transcript, /PARTIAL_SECRET/);
  ui.busy('Waiting for approval'); ui.success('Connected'); ui.close();
  assert.match(transcript, /38;2;57;255;20/); input.destroy();
});

test('local setup discovers models without cloud credentials or project setup', async t => {
  for (const type of ['ollama','lmstudio']) {
    const directory = await temp(t), ui = fakeUI({ 'Model provider': type });
    const profile = await configureProfile({ directory, ui, env: { OPENAI_API_KEY: 'UNRELATED_SECRET' }, fetchImpl: async (url, options) => {
      assert.ok(url.endsWith('/v1/models')); assert.deepEqual(options.headers, {});
      return Response.json({data:[{id:'tool-model'}]});
    } });
    assert.equal(profile.config.provider.model, 'tool-model'); assert.equal(profile.config.provider.apiKeyEnv, null);
    assert.equal(profile.providerKey, undefined); assert.deepEqual(await readProfile(directory), profile);
    assert.doesNotMatch(await readFile(path.join(directory,'agent.json'),'utf8'), /UNRELATED_SECRET/);
  }
});

test('failed local discovery can cancel without replacing an existing profile', async t => {
  const directory = await temp(t), previous = { version:1, origin:'https://scape.wtf', config:config() };
  await saveProfile(directory, previous);
  const ui = fakeUI({'Model provider':'ollama','Local server':'cancel'});
  await assert.rejects(configureProfile({previous,directory,ui,env:{},fetchImpl:async()=>{throw new Error('SECRET_NETWORK_ERROR');}}), /Stopped/);
  assert.deepEqual(await readProfile(directory), previous); assert.doesNotMatch(ui.lines.join('\n'), /SECRET_NETWORK_ERROR/);
});

test('xAI and Gemini guided setup use dedicated environment keys and official endpoints', async t => {
  for (const [type,variable,endpoint] of [['xai','XAI_API_KEY','https://api.x.ai/v1'],['gemini','GEMINI_API_KEY','https://generativelanguage.googleapis.com/v1beta/openai']]) {
    const directory=await temp(t),ui=fakeUI({'Model provider':type,'Tool-capable model ID':'tool-model'});
    const profile=await configureProfile({directory,ui,env:{[variable]:'CLOUD_SECRET'}});
    assert.equal(profile.config.provider.apiKeyEnv,variable); assert.equal(profile.config.provider.baseUrl,endpoint);
    assert.equal(profile.providerKey,undefined); assert.doesNotMatch(await readFile(path.join(directory,'agent.json'),'utf8'), /CLOUD_SECRET/);
  }
});

test('private profile rejects shared permissions, symlinks and hardlinks without revealing content', async t => {
  const directory=await temp(t), profile={version:1,origin:'https://scape.wtf',config:config(),providerKey:'PRIVATE_SECRET'};
  const file=path.join(directory,'agent.json'), target=path.join(directory,'original.json');
  await saveProfile(directory,profile); await chmod(file,0o644);
  await assert.rejects(readProfile(directory),/owner-only/); await chmod(file,0o600);
  await writeFile(target,JSON.stringify(profile),{mode:0o600}); await rm(file); await symlink(target,file);
  await assert.rejects(readProfile(directory),e=>!e.message.includes('PRIVATE_SECRET'));
  await rm(file); await link(target,file); await assert.rejects(readProfile(directory),/not links/);
  await rm(file); await saveProfile(directory,profile); await chmod(directory,0o755);
  await assert.rejects(readProfile(directory),/owner-only/);
});

test('guided Clef setup keeps decision credentials separate and drops them when account or provider changes',async t=>{
  const directory=await temp(t);
  const answers={'Model provider':'openrouter','Tool-capable model ID':'conversation-model','API key (hidden)':'CHAT_SECRET',
    'Decision model':'cloudflare','Cloudflare account ID':'a'.repeat(32),'Cloudflare decision model':'clef-flash','Decision API key (hidden)':'DECISION_SECRET'};
  const ui=fakeUI(answers),profile=await configureProfile({directory,ui,env:{}});
  assert.equal(profile.providerKey,'CHAT_SECRET');assert.equal(profile.decisionKey,'DECISION_SECRET');
  assert.equal(profile.config.decision.type,'cloudflare');assert.equal(profile.config.decision.model,'clef-flash');
  assert.doesNotMatch(ui.lines.join('\n'),/CHAT_SECRET|DECISION_SECRET/);
  const changed=await configureProfile({directory,previous:profile,ui:fakeUI({...answers,'Cloudflare account ID':'b'.repeat(32),'Decision API key (hidden)':'NEW_DECISION_KEY'}),env:{}});
  assert.equal(changed.decisionKey,'NEW_DECISION_KEY');
  const disabled=await configureProfile({directory,previous:changed,ui:fakeUI({...answers,'Decision model':'none'}),env:{}});
  assert.equal(disabled.config.decision,undefined);assert.equal(disabled.decisionKey,undefined);
  assert.doesNotMatch(await readFile(path.join(directory,'agent.json'),'utf8'),/DECISION_SECRET|NEW_DECISION_KEY/);
});

test('decision setup supports JEV, compatible endpoints, local structured models and custom adapters without a project',async t=>{
  for(const type of ['typesafe','system-one','openai-compatible','custom']){
    const directory=await temp(t),adapter=path.join(directory,'adapter.mjs');
    if(type==='custom')await writeFile(adapter,'export default () => ({ evaluate() {} });');
    const ui=fakeUI({'Model provider':'xai','Tool-capable model ID':'conversation',
      'Decision model':type,'Decision model ID':type==='typesafe'?'jev-latest':'local-decision',
      'Decision API URL (full endpoint)':'http://127.0.0.1:5555/decisions',
      'Decision API base URL (without /chat/completions)':'http://127.0.0.1:5555/v1',
      'Decision adapter file':adapter,'Decision credentials':type==='typesafe'?'env':'none'});
    const profile=await configureProfile({directory,ui,env:{XAI_API_KEY:'CHAT_ENV',TYPESAFE_API_KEY:'DECISION_ENV'}});
    assert.equal(profile.config.decision.type,type);assert.equal(profile.decisionKey,undefined);
    assert.doesNotMatch(await readFile(path.join(directory,'agent.json'),'utf8'),/CHAT_ENV|DECISION_ENV/);
    if(type==='custom')assert.equal(profile.config.decision.adapter,adapter);
  }
});

test('model-only setup removes a previously configured decision model and its key',async t=>{
  const directory=await temp(t),previous={version:1,origin:'https://scape.wtf',config:{...config(),decision:{type:'typesafe'}},decisionKey:'REMOVE_ME'};
  const profile=await configureProfile({directory,previous,ui:fakeUI({'World behavior':'model'}),env:{}});
  assert.equal(profile.config.behavior.enabled,false);assert.equal(profile.config.decision,undefined);assert.equal(profile.decisionKey,undefined);
});

test('cancelling at review preserves the saved profile and does not persist newly entered secrets',async t=>{
 const directory=await temp(t),previous={version:1,origin:'https://scape.wtf',config:config()};await saveProfile(directory,previous);
 const ui=fakeUI({'Model provider':'openrouter','Tool-capable model ID':'fixture','API key (hidden)':'UNSAVED_SECRET'}),choose=ui.choose;
 ui.choose=async(label,...args)=>{if(label==='Review settings')throw new Error('cancel review');return choose(label,...args);};
 await assert.rejects(configureProfile({directory,previous,ui,env:{}}),/cancel review/);
 assert.deepEqual(await readProfile(directory),previous);assert.doesNotMatch(await readFile(path.join(directory,'agent.json'),'utf8'),/UNSAVED_SECRET/);
});

test('managed CLI remembers a stable encounter across process restarts without repeating a greeting', {timeout:20000}, async t=>{
  const directory=await temp(t);let generation=0,speaks=0,enters=0,observes=0;const failures=[];
  const observation={protocol:1,sessionId:'memory-session',revision:1,observedAt:1,room:'world',status:'connected',self:{id:'agent',name:'Scout',x:1,y:1,floor:0,text:''},players:[],roster:[],objects:[],blocked:[],movement:null,limits:{radius:10,heartbeatMs:250,idleTimeoutMs:15000,maxSpeechLength:320}};
  const server=http.createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);let result={ok:true};
      if(req.url==='/v1/chat/completions'){
        const review=body.tools.some(tool=>tool.function?.name==='agent_review_reply');
        const call=review||++generation%2===1;
        result={choices:[{finish_reason:call?'tool_calls':'stop',message:{role:'assistant',content:call?null:'Done',...(call?{tool_calls:[{id:'call',type:'function',function:{name:review?'agent_review_reply':'scape_speak',arguments:JSON.stringify(review?{grounded:true,relevant:true}:{text:'Hello!'})}}]}:{})}}]};
      }else if(req.url==='/api/agents/link/poll')result={approved:true,room:'world'};
      else if(req.url==='/api/agents/enter'){
        enters++;const visitor={id:`connection-${enters}`,name:'Visible name never stored',x:3,y:1,floor:0,text:'',textRevision:1,settled:true};observation.players=[visitor];observation.roster=[{...visitor,encounterKey:'a'.repeat(64)}];observation.self.text='';result=observation;
      }else if(req.url==='/api/agents/observe'){observes++;result=observation;}
      else if(req.url==='/api/agents/speak'){if(body.text&&body.text!=='…')speaks++;observation.self.text=body.text;observation.revision++;}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }catch(error){failures.push(error);res.writeHead(500);res.end('{}');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  await saveProfile(directory,{version:1,origin,config:parseAgentConfig({name:'Scout',provider:{type:'openai-compatible',model:'fixture',baseUrl:origin+'/v1',apiKeyEnv:null},limits:{minTurnIntervalMs:500}}),grant:{origin,name:'Scout',token:'FIXTURE_GRANT'}});
  const waitFor=async condition=>{for(let i=0;i<160;i++){if(condition())return;await delay(50);}assert.fail('CLI memory test timed out');};
  for(let run=0;run<2;run++){
    const child=spawn(process.execPath,[cli,'agent','run'],{cwd:tmpdir(),env:{...process.env,SCAPE_CLI_HOME:directory},stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',chunk=>text+=chunk);child.stderr.on('data',chunk=>text+=chunk);t.after(()=>child.kill('SIGKILL'));
    const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
    await waitFor(()=>text.includes('is running'));if(run===0)await waitFor(()=>speaks===1&&generation===2);else{await delay(3000);assert.equal(speaks,1);assert.equal(generation,2);}
    child.kill('SIGINT');assert.deepEqual(await exited,{code:0,signal:null},text);
  }
  assert.equal(enters,2);assert.ok(observes>2);assert.deepEqual(failures,[]);
  const stored=await readFile(path.join(directory,'encounters.json'),'utf8');assert.doesNotMatch(stored,/Visible name|Hello!|FIXTURE_GRANT|connection-/);assert.match(stored,/lastConversation/);
});
