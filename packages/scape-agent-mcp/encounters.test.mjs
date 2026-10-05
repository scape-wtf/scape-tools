import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat,writeFile,chmod,symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openEncounterMemory} from './encounters.mjs';
import {createBehaviorMemory,createWorldBehavior} from './world-behavior.mjs';
import {parseAgentConfig} from './runner-config.mjs';
const key='a'.repeat(64),identity={origin:'https://example.test',room:'world',agent:'Nova'};
async function temp(t){const dir=await mkdtemp(path.join(tmpdir(),'scape-memory-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('encounters survive restart, separate world/host/agent scopes and never store dialogue',async t=>{
 const directory=await temp(t);let now=100000;
 let store=await openEncounterMemory({directory,now:()=>now}),s=store.scope(identity);s.see(key,true);now+=2000;s.see(key,true);s.spoke(key);s.boundary(key,{quietUntil:now+120000});await store.close();
 const raw=await readFile(path.join(directory,'encounters.json'),'utf8');assert.doesNotMatch(raw,/text|name|transcript|token|instructions/i);assert.equal((await stat(path.join(directory,'encounters.json'))).mode&0o777,0o600);
 store=await openEncounterMemory({directory,now:()=>now});s=store.scope(identity);assert.equal(s.context(key).metBefore,true);assert.equal(s.context(key).secondsNearby,2);assert.equal(s.get(key).quietUntil,now+120000);
 for(const changed of [{room:'other'},{origin:'https://other.test'},{agent:'Scout'}])assert.equal(store.scope({...identity,...changed}).context(key).metBefore,false);
 assert.equal(s.context('ephemeral-id').metBefore,false);s.see('ephemeral-id',true);assert.equal(store.list().length,1);await store.close();
});
test('inactive encounters expire after thirty days; inspection, forgetting and clearing are explicit',async t=>{
 const directory=await temp(t);let now=100000;
 let store=await openEncounterMemory({directory,now:()=>now});store.scope(identity).see(key,true);await store.close();
 now+=31*86400000;store=await openEncounterMemory({directory,now:()=>now});assert.equal(store.list().length,0);
 const s=store.scope(identity);s.greet(key);s.greet('b'.repeat(64));const records=store.list();store.forget(records[0].id);assert.equal(store.list().length,1);store.clear();assert.equal(store.list().length,0);await store.close();
 assert.equal(JSON.parse(await readFile(path.join(directory,'encounters.json'),'utf8')).version,1);
});
test('private files reject unsafe permissions, links, corrupt formats and concurrent writers',async t=>{
 const directory=await temp(t),store=await openEncounterMemory({directory});store.scope(identity).greet(key);await store.flush();
 await assert.rejects(openEncounterMemory({directory}),/in use/);await store.close();
 const file=path.join(directory,'encounters.json');await chmod(file,0o644);await assert.rejects(openEncounterMemory({directory}),/private encounter/);await chmod(file,0o600);
 const target=path.join(directory,'original');await writeFile(target,'{}',{mode:0o600});await rm(file);await symlink(target,file);await assert.rejects(openEncounterMemory({directory}),/private encounter/);await rm(file);
 await writeFile(file,'{"version":999}',{mode:0o600});await assert.rejects(openEncounterMemory({directory}),/private encounter/);
});
test('read-only inspection never creates storage and does not race the active writer',async t=>{
 const root=await temp(t),directory=path.join(root,'missing');let store=await openEncounterMemory({directory,readOnly:true});assert.deepEqual(store.list(),[]);await store.close();await assert.rejects(stat(directory),{code:'ENOENT'});
 store=await openEncounterMemory({directory});store.scope(identity).greet(key);await store.flush();const reader=await openEncounterMemory({directory,readOnly:true});assert.equal(reader.list().length,1);await assert.rejects(async()=>reader.clear(),/read-only/);await reader.close();await store.close();
});
test('shared behavior restores greeting and quiet boundaries and exposes encounter context, not transcripts',async t=>{
 const directory=await temp(t),now=100000,store=await openEncounterMemory({directory,now:()=>now});const encounters=store.scope(identity);encounters.spoke(key);encounters.boundary(key,{quietUntil:now+10000});
 const person={id:'p',name:'A visitor',x:2,y:1,floor:0,text:'Nova, hello',textRevision:1,settled:true};
 const state={self:{id:'agent',name:'Nova',x:1,y:1,floor:0,text:''},players:[person],roster:[{...person,encounterKey:key}],blocked:[],objects:[]};
 let turns=0;const context={observation:state,signal:new AbortController().signal,tools:{call:async()=>({ok:true})},interrupt(){},requestTurn(){}};
 const memory=createBehaviorMemory({encounters});const agent=createWorldBehavior({config:parseAgentConfig({name:'Nova',provider:{type:'ollama',model:'fixture'}}),context,memory,now:()=>now,policy:{onTurn(){turns++;}}});
 agent.onObservation(state,[{type:'speech',player:person}]);await agent.onTurn({observation:state,events:[{type:'speech',player:person}]},context);
 assert.equal(turns,0);assert.equal(memory.visitors.get(key).greeted,now);assert.equal(memory.visitors.get(key).encounter.metBefore,true);await store.close();
});
