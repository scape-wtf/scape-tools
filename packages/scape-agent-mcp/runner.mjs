import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mcpTools, runAgentSession } from './runtime.mjs';
import { parseAgentConfig, validateEndpoint } from './runner-config.mjs';
import { createModelPolicy } from './model-policy.mjs';
import { ScapeAgent } from './transport.mjs';
import { runAgentPresence } from './presence.mjs';
import { createWorldBehavior, createBehaviorMemory, behaviorTool, behaviorInstructions } from './world-behavior.mjs';
import { loadAgentPolicy } from './policy-loader.mjs';
import { openEncounterMemory } from './encounters.mjs';
import { createDecisionClient } from './decision.mjs';
export { providerPresets, decisionPresets, parseAgentConfig, validateEndpoint } from './runner-config.mjs';

/** CLI entry; pairing belongs to the owner and every world action still uses MCP. */
export async function runAgent({ directory = process.cwd(), origin, signal, log = console.log, config: suppliedConfig, apiKey: suppliedKey, decisionApiKey, token: suppliedToken, assetDirectory, memoryDirectory, onState = () => {} }) {
  const base=path.resolve(directory);
  const gameOrigin=validateEndpoint(origin,true);
  if (!suppliedConfig) try { process.loadEnvFile(path.join(base,'.env')); } catch(error) { if(error.code!=='ENOENT')throw new Error('Cannot load the agent project .env file.'); }
  let raw = suppliedConfig;
  if (!raw) try { raw=JSON.parse(await readFile(path.join(base,'scape.agent.json'),'utf8')); }
  catch { throw new Error('Cannot read scape.agent.json. Run scape agent init first, then run from that project directory.'); }
  const config=parseAgentConfig(raw);
  let policyFactory,apiKey;
  if(config.policy){
    policyFactory=await loadAgentPolicy(base,config.policy);
  }else{
    apiKey=suppliedKey ?? (config.provider.apiKeyEnv ? process.env[config.provider.apiKeyEnv] : undefined);
    if(config.provider.apiKeyEnv && !apiKey)throw new Error(`Set ${config.provider.apiKeyEnv} in your environment or project .env file.`);
  }
  const token = suppliedConfig ? suppliedToken : (suppliedToken ?? process.env.SCAPE_AGENT_TOKEN);
  const assets = suppliedConfig ? assetDirectory : (assetDirectory ?? process.env.SCAPE_AGENT_ASSET_DIR);
  const shutdown=new AbortController(),stop=()=>shutdown.abort();
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  for(const name of ['SIGINT','SIGTERM'])process.once(name,stop);
  const client=new Client({name:'scape-persistent-agent',version:'0.1.0'});
  let decision,encounterStore;
  try{
    shutdown.signal.throwIfAborted();
    if(config.decision)decision=await createDecisionClient({config:config.decision,directory:base,
      apiKey:decisionApiKey??(config.decision.apiKeyEnv?process.env[config.decision.apiKeyEnv]:undefined),onStatus:log,onState});
    onState('connecting');
    await client.connect(new StdioClientTransport({command:process.execPath,
      args:[fileURLToPath(new URL('./cli.mjs',import.meta.url)),gameOrigin],
      env:{...(token?{SCAPE_AGENT_TOKEN:token}:{}),
        ...(assets?{SCAPE_AGENT_ASSET_DIR:path.resolve(base,assets)}:{})},stderr:'pipe'}));
    const tools=mcpTools(client);
    if(!token){
      const pair=await tools.call('scape_pair',{name:config.name},{signal:shutdown.signal});
      log(`Approve code ${pair.code} in Scape → Settings → Developer → Agents.`);
    }
    let entry;
    do{
      entry=await tools.call('scape_enter',{}, {signal:shutdown.signal});
      if(!entry.entered)await delay(1500,undefined,{signal:shutdown.signal});
    }while(!entry.entered);
    await tools.call('scape_set_avatar',config.avatar,{signal:shutdown.signal});
    const {tools:toolDefinitions}=await client.listTools();
    onState('listening');
    log(`${config.name} is running. Ctrl+C leaves the world.`);
    const budget={calls:0,nextTurn:0},memories=new Map();
    const shared=!policyFactory&&config.behavior.enabled;
    if(shared&&config.memory.enabled){
      if(process.platform==='win32')log('Persistent encounter memory is unavailable on native Windows; using temporary session memory. Use WSL for private persistent storage.');
      else encounterStore=await openEncounterMemory({directory:memoryDirectory??path.join(base,'.scape-memory'),onError:log});
    }
    const memoryFor=room=>{
      if(!memories.has(room))memories.set(room,createBehaviorMemory({encounters:encounterStore?.scope({origin:gameOrigin,room,agent:config.name})}));
      return memories.get(room);
    };
    const createAgent=context=>{
      if(policyFactory)return policyFactory(context);
      const policy=createModelPolicy({config,toolDefinitions:shared?[...toolDefinitions,behaviorTool]:toolDefinitions,apiKey,decision,onStatus:log,onState,budget,
        instructions:shared?behaviorInstructions:''});
      return shared?createWorldBehavior({config,context,policy,memory:memoryFor(context.observation.room),decision}):policy;
    };
    if(shared)await runAgentPresence({tools,initialObservation:entry.observation,signal:shutdown.signal,createAgent,
      sleepAfterMs:config.behavior.sleepAfterMs,wakeIntervalMs:config.behavior.wakeIntervalMs,onState});
    else await runAgentSession({tools,initialObservation:entry.observation,signal:shutdown.signal,createAgent});
  }catch(error){
    if(!shutdown.signal.aborted){
      // Custom code may throw sensitive errors; only our bounded operational messages are printable.
      if(config.policy)throw new Error('Custom agent policy stopped. Check its configuration and implementation.');
      if(error?.name==='TimeoutError')throw new Error('Agent turn timed out. Check provider latency or limits.turnTimeoutMs.');
      throw error;
    }
  }finally{
    stop();signal?.removeEventListener('abort',stop);
    for(const name of ['SIGINT','SIGTERM'])process.removeListener(name,stop);
    onState('leaving');
    try{await client.close();}finally{try{await decision?.close();}finally{await encounterStore?.close();}}
    onState('stopped');
  }
}

/** Owner-side access setup. Bearers never appear in MCP results or model context. */
export async function checkAgentAccess({ origin, token }) {
  try { return await new ScapeAgent({ origin: validateEndpoint(origin, true), token }).pairingStatus(); }
  catch (error) {
    if ([401,403,404,410].includes(error.status)) return { approved: false, expired: true };
    throw new Error('Cannot reach Scape to check access. Check your connection and host, then try again.');
  }
}
export async function pairAgent({ origin, name, signal, onCode = () => {} }) {
  let token;
  const agent = new ScapeAgent({ origin: validateEndpoint(origin, true), onToken: value => { token = value; } });
  signal?.throwIfAborted();
  let pair;
  try { pair = await agent.pair(name); }
  catch { throw new Error('Cannot start pairing. Check your Scape host and connection, then try again.'); }
  signal?.throwIfAborted();
  onCode(pair);
  while (Date.now() < pair.expiresAt) {
    signal?.throwIfAborted();
    const status = await checkAgentAccess({ origin, token });
    signal?.throwIfAborted();
    if (status.approved) return { token, ...status };
    if (status.expired) break;
    await delay(1500, undefined, { signal });
  }
  throw new Error('Pairing code expired. Run scape agent login to get a new code.');
}
