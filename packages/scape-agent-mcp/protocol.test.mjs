import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { AGENT_NAME_MAX_LENGTH, GRID, MAX_STATUS_TEXT_LENGTH } from './contracts.mjs';
const script = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const until = async read => { for(let i=0;i<40;i++){if(await read())return;await delay(50);}throw new Error('Timed out'); };

for (const umbrella of [false, true]) {
  const entry = umbrella ? fileURLToPath(new URL('../scape-cli/cli.mjs', import.meta.url)) : script;
  const launch = (origin, config = false) => umbrella
    ? [entry, 'agent', 'mcp', config ? 'config' : 'serve', '--origin', origin]
    : [entry, ...(config ? ['--config'] : []), origin];

test(`${umbrella ? 'scape' : 'adapter'} configuration uses absolute paths without exposing operator credentials`, async () => {
  const run = promisify(execFile);
  const secret = 'FIXTURE_CONFIG_SECRET';
  const { stdout, stderr } = await run(process.execPath, launch('https://scape.example.invalid', true), {
    cwd: tmpdir(), env: { ...process.env, SCAPE_AGENT_TOKEN: secret },
  });
  assert.deepEqual(JSON.parse(stdout), { mcpServers: { scape: {
    command: process.execPath, args: [script, 'https://scape.example.invalid'],
  } } });
  assert.equal(stderr, ''); assert.ok(!stdout.includes(secret));
  await assert.rejects(run(process.execPath, launch('http://public.example.invalid', true)),
    error => error.code === 1 && error.stdout === '' && /HTTPS origin/.test(error.stderr));
});

for (const shutdown of ['eof', 'SIGINT', 'SIGTERM']) {
test(`${umbrella ? 'scape' : 'adapter'} official MCP client pairs, acts and leaves on ${shutdown}`, { timeout: 15_000 }, async t => {
  const secret = 'FIXTURE_SECRET_MUST_NOT_REACH_MODEL'; const requests = []; let approved = false, leaves = 0;
  const observation = { protocol:1,sessionId:'fixture-session',revision:1,observedAt:1,room:'approved-world',status:'connected',
    self:{id:'agent',name:'Scout · AI',x:2,y:3,floor:0,text:''},players:[{id:'visitor',name:'Visitor',x:3,y:3,floor:0,text:'Hello',textRevision:1,settled:true}],objects:[],blocked:[],movement:null,
    limits:{radius:10,heartbeatMs:2000,idleTimeoutMs:15000,maxSpeechLength:320} };
  const httpServer = http.createServer(async (req,res) => {
    let body='';for await(const chunk of req)body+=chunk;
    const action=req.url.slice('/api/agents/'.length);const value=JSON.parse(body);requests.push({action,value});
    if(action!=='link/start'&&req.headers.authorization!==`Bearer ${secret}`){res.writeHead(401);res.end('{}');return;}
    let result={ok:true};
    if(action==='link/start')result={secret,code:'ABCD1234ABCD1234',expiresAt:Date.now()+300_000};
    if(action==='link/poll')result={approved,expiresAt:Date.now()+300_000};
    if(action==='enter'||action==='observe')result=observation;
    if(action==='leave')leaves++;
    if(action==='move-to')result={operationId:value.id};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${httpServer.address().port}`;
  const transport=new StdioClientTransport({command:process.execPath,args:launch(origin),cwd:tmpdir(),stderr:'pipe'});
  const client=new Client({name:'provider-independent-fixture',version:'1.0.0'});
  let stderr='';
  t.after(async()=>{await client.close();httpServer.closeAllConnections();await new Promise(resolve=>httpServer.close(resolve));});
  await client.connect(transport); transport.stderr?.on('data',chunk=>{stderr+=chunk;});
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(tool=>tool.name).sort(),['scape_approach','scape_avatar_catalog','scape_avatar_files','scape_enter','scape_expression','scape_follow','scape_guide','scape_interact','scape_leave','scape_move_to','scape_observe','scape_pair','scape_set_avatar','scape_speak','scape_step','scape_stop','scape_world_status']);
  const call=async(name,args={})=>{
    const result=await client.callTool({name,arguments:args});
    assert.ok(!JSON.stringify(result).includes(secret));return result;
  };
  assert.equal((await call('scape_pair',{name:'x'.repeat(AGENT_NAME_MAX_LENGTH + 1)})).isError,true);
  assert.equal(requests.length,0,'invalid pairing names must not reach the gateway');
  const paired=await call('scape_pair',{name:'Scout'});assert.equal(paired.isError,undefined);
  assert.equal(paired.structuredContent.code,'ABCD1234ABCD1234');
  assert.equal((await call('scape_enter')).structuredContent.entered,false);
  approved=true;assert.equal((await call('scape_enter')).structuredContent.entered,true);
  await until(()=>requests.some(r=>r.action==='observe'));
  assert.equal((await call('scape_observe')).structuredContent.players[0].text,'Hello');
  const before=requests.length;
  assert.equal((await call('scape_move_to',{x:GRID.width,y:3,floor:0})).isError,true);
  assert.equal((await call('scape_step',{x:0,y:GRID.height,floor:0})).isError,true);
  assert.equal((await call('scape_speak',{text:'x'.repeat(MAX_STATUS_TEXT_LENGTH + 1)})).isError,true);
  assert.equal((await call('scape_speak',{text:'hello',origin:'https://other.invalid'})).isError,true);
  assert.equal(requests.length,before,'invalid tool inputs must not reach the gateway');
  assert.equal((await call('scape_speak',{text:'Hello back',commandId:'speech-fixture-01'})).isError,undefined);
  assert.equal((await call('scape_move_to',{x:4,y:3,floor:0})).isError,undefined);
  assert.equal((await call('scape_stop')).isError,undefined);
  assert.equal(requests.find(r=>r.action==='speak').value.id,'speech-fixture-01');
  assert.match(requests.find(r=>r.action==='move-to').value.id,/^[a-f0-9]{64}$/);
  await call('scape_leave');assert.equal(leaves,1);
  await call('scape_enter');
  if (shutdown === 'eof') await client.close();
  else process.kill(transport.pid, shutdown);
  await until(()=>leaves===2);
  await client.close();
  assert.ok(!stderr.includes(secret));assert.ok(!stderr.includes('protocol error'),stderr);
});

}

test(`${umbrella ? 'scape' : 'adapter'} legacy MCP clients can initialize and list Scape tools without network or pairing`, {timeout:5000}, async t=>{
  const child=spawn(process.execPath,launch('https://scape.example.invalid'),{stdio:['pipe','pipe','pipe'],cwd:tmpdir()});
  const lines=createInterface({input:child.stdout});const pending=new Map();let errors='';
  child.stderr.on('data',chunk=>{errors+=chunk;});
  lines.on('line',line=>{const response=JSON.parse(line);pending.get(response.id)?.(response);pending.delete(response.id);});
  const request=(id,method,params)=>new Promise(resolve=>{pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  t.after(()=>{lines.close();child.kill('SIGTERM');});
  const initialized=await request(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-fixture',version:'1'}});
  assert.equal(initialized.error,undefined);assert.equal(initialized.result.protocolVersion,'2025-11-25');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const listed=await request(2,'tools/list',{});assert.equal(listed.result.tools.length,17);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();assert.equal(await exited,0);assert.equal(errors,'');
});

}
