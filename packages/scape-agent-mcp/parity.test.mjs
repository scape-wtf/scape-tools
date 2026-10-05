import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldBehavior } from './world-behavior.mjs';
import { parseAgentConfig } from './runner-config.mjs';
import { runAgentSession } from './runtime.mjs';
const alice={id:'alice',name:'Alice',x:3,y:1,floor:0,text:'',textRevision:0,settled:true};
const bob={...alice,id:'bob',name:'Bob',x:6};
const piano={id:'piano',emoji:'🎹',x:6,y:4,floor:0};
const initial=()=>({sessionId:'test',revision:1,status:'connected',self:{id:'agent',name:'Nova',x:1,y:1,floor:0,text:''},players:[{...alice},{...bob}],roster:[alice,bob],blocked:[],objects:[],scene:{floor:0,blocked:[],objects:[]},movement:null,appearance:{expressions:['neutral','happy','curious','sympathetic']}});
function decision(action='reply',extra={}) {return {async evaluate({questions}){return Object.fromEntries(Object.keys(questions).map(k=>[k,{type:'choice',choice:k.endsWith('_action')?action:k.endsWith('_object')?'o0':k==='mood'?'warm':'explore',...(k.endsWith('_action')?extra:{})}]));}};}
function fixture({policy={async onTurn(){}},client,behavior={}}={}){
 let time=100000,state=initial();const calls=[];let interrupts=0;const abort=new AbortController();
 const context={get observation(){return state;},signal:abort.signal,interrupt(){interrupts++;},requestTurn(){},tools:{async call(name,args){calls.push({name,args});return {ok:true,operationId:'move'};}}};
 const agent=createWorldBehavior({config:parseAgentConfig({name:'Nova',provider:{type:'ollama',model:'fixture'},behavior}),context,policy,decision:client,now:()=>time});
 const f={agent,context,calls,get interrupts(){return interrupts;},advance(n){time+=n;},observe(patch={},events=[]){state={...state,...patch};agent.onObservation(state,events);},speech(text,p=alice){const player={...p,text,textRevision:p.textRevision+1};f.observe({players:state.players.map(v=>v.id===p.id?player:v)},[{type:'speech',player}]);return {type:'speech',player};},turn(events=[{type:'idle'}]){return agent.onTurn({events,observation:state},context);}};f.observe();return f;
}

test('BUG-157: floor transitions preserve an active follow pursuit',async()=>{
 const f=fixture();f.observe({self:{...f.context.observation.self,floor:1},pursuit:{id:'p',player:'alice',mode:'follow',status:'moving'}});await new Promise(setImmediate);
 assert.ok(!f.calls.some(c=>c.name==='scape_stop'));
});
test('BUG-158: rejected direct decision actions recover and later questions still work',async()=>{
 let turns=0;const f=fixture({client:decision('interact'),policy:{async onTurn(t){turns++;assert.ok(t.events.some(e=>e.type==='action_failure'));}}});
 f.observe({scene:{blocked:[],objects:[{...piano,x:2,y:1}]}});
 const call=f.context.tools.call;f.context.tools.call=async(n,a)=>{if(n==='scape_interact')throw Object.assign(new Error('unavailable'),{code:'interaction_unavailable'});return call(n,a);};
 await f.turn([f.speech('Nova, play the piano')]);assert.equal(turns,1);
 await f.turn([f.speech('Nova, try again',{...alice,textRevision:2})]);assert.equal(turns,2);
});
test('BUG-159: unrelated speech does not abort an active answer in a real runtime',async()=>{
 let state=initial(),started=false,replied=false,release;const blocked=new Promise(r=>release=r),abort=new AbortController();let polls=0;
 const tools={async call(name,args){if(name==='scape_observe'){
  polls++;if(polls===1)state={...state,revision:2,players:[{...alice,text:'Nova, hello',textRevision:1},bob]};
  if(started&&!replied){state={...state,revision:3,players:[state.players[0],{...bob,text:'Carol, hello',textRevision:1}]};setTimeout(release,20);}
  if(replied)abort.abort();return state;
 }return {ok:true};}};
 const config=parseAgentConfig({name:'Nova',provider:{type:'ollama',model:'fixture'}});
 const timeout=setTimeout(()=>abort.abort(),1500);
 try{await runAgentSession({tools,initialObservation:state,signal:abort.signal,createAgent:context=>createWorldBehavior({config,context,decision:decision('reply'),policy:{async onTurn(t,c){if(!t.events.some(e=>e.type==='speech'&&e.player.id==='alice'))return;started=true;await blocked;c.signal.throwIfAborted();replied=true;}}})});}finally{clearTimeout(timeout);}
 assert.equal(replied,true);
});
test('BUG-160: ignored name mentions cannot erase a reply during its reading window',async()=>{
 const f=fixture({client:decision('ignore')});f.observe({self:{...f.context.observation.self,text:'Here is your answer'}});f.advance(100);
 await f.turn([f.speech('Alice said Nova is funny',bob)]);assert.ok(!f.calls.some(c=>c.name==='scape_stop'));
});
test('BUG-161: quiet applies to the requesting visitor while other visitors can converse',async()=>{
 const turns=[];const f=fixture({policy:{async onTurn(t){turns.push(t);}}});await f.turn([f.speech('Nova, be quiet')]);
 await f.turn([f.speech('Nova, can you help me?',bob)]);assert.equal(turns.length,1);assert.equal(turns[0].events.find(e=>e.type==='speech').player.id,'bob');
});
test('decision input includes bounded exchanges and confirmed recent action outcomes',async()=>{
 const inputs=[];const client={async evaluate(r){inputs.push(r.state);return decision().evaluate(r);}};
 const f=fixture({client,policy:{async onTurn(_,c){await c.tools.call('scape_speak',{text:'Would you like help?'});}}});
 await f.turn([f.speech('Nova, hello')]);await f.turn([f.speech('Yes please',{...alice,textRevision:2})]);
 const last=inputs.at(-1);assert.ok(JSON.stringify(last.history).includes('Would you like help?'));assert.ok(last.recentActions.some(a=>a.tool==='scape_speak'));
});
test('uncertain specialist actions clarify instead of moving; choice-only models remain supported',async()=>{
 for(const extra of [{probabilities:{follow:.4,reply:.3,ignore:.3},confidence:.1},{}]){
  let replies=0;const f=fixture({client:decision('follow',extra),policy:{async onTurn(){replies++;}}});await f.turn([f.speech('Nova, maybe follow?')]);
  assert.equal(f.calls.some(c=>c.name==='scape_follow'),!extra.probabilities);assert.equal(replies,extra.probabilities?1:0);
 }
});
test('object goals move beside a reachable object and use it only after confirmed arrival',async()=>{
 const f=fixture({client:decision('interact')});f.observe({scene:{blocked:[],objects:[piano]}});await f.turn([f.speech('Nova, play the piano')]);
 const move=f.calls.find(c=>c.name==='scape_move_to');assert.ok(move);assert.ok(!f.calls.some(c=>c.name==='scape_interact'));
 f.observe({self:{...f.context.observation.self,...move.args},movement:{id:'move',status:'arrived'}});await f.turn();
 assert.equal(f.calls.filter(c=>c.name==='scape_interact').length,1);await f.turn();assert.equal(f.calls.filter(c=>c.name==='scape_interact').length,1);
});
test('independent exploration uses an available feature after arriving',async()=>{
 const f=fixture();f.observe({players:[],scene:{blocked:[],objects:[piano]}});f.advance(31000);await f.turn();
 const move=f.calls.find(c=>c.name==='scape_move_to');assert.ok(move);
 f.observe({self:{...f.context.observation.self,...move.args},movement:{id:'move',status:'arrived'}});await f.turn();
 assert.ok(f.calls.some(c=>c.name==='scape_interact'));
});

test('queued visitors get one reply each after the reading window, without duplicates',async()=>{
 const heard=[];const f=fixture({client:decision(),policy:{async onTurn(t,c){heard.push(t.events.find(e=>e.type==='speech').player.id);await c.tools.call('scape_speak',{text:'Hello'});}}});
 const a=f.speech('Nova, hello'),b=f.speech('Nova, hello',bob);await f.turn([a,b]);assert.deepEqual(heard,['alice']);
 f.observe({self:{...f.context.observation.self,text:'Hello'}});await f.turn();assert.deepEqual(heard,['alice']);
 f.advance(5000);f.agent.tick();await f.turn();assert.deepEqual(heard,['alice','bob']);await f.turn();assert.deepEqual(heard,['alice','bob']);
});
test('natural resume is evaluated for the quiet visitor without unmuting others',async()=>{
 let action='resume';const heard=[];
 const f=fixture({client:{evaluate:r=>decision(action).evaluate(r)},policy:{async onTurn(t){heard.push(t.events.find(e=>e.type==='speech').player.id);}}});
 await f.turn([f.speech('Nova, be quiet')]);await f.turn([f.speech('Nova, be quiet',bob)]);
 await f.turn([f.speech('I would like you to talk to me again',{...alice,textRevision:2})]);action='reply';
 await f.turn([f.speech('Nova, hello again',{...alice,textRevision:3})]);
 await f.turn([f.speech('Nova, a question',{...bob,textRevision:3})]);
 assert.deepEqual(heard,['alice']);assert.equal(f.calls.filter(c=>c.name==='scape_stop').length,2);
});

test('stale, blocked and superseded object goals never interact',async()=>{
 for(const outcome of ['removed','blocked','stop','departed']){
  const f=fixture({client:decision('interact')});f.observe({scene:{blocked:[],objects:[piano]}});await f.turn([f.speech('Nova, play the piano')]);
  const move=f.calls.find(c=>c.name==='scape_move_to');assert.ok(move);
  if(outcome==='removed')f.observe({scene:{blocked:[],objects:[]}});
  if(outcome==='blocked')f.observe({movement:{id:'move',status:'blocked'}});
  if(outcome==='departed')f.observe({players:[bob],roster:[bob]});
  if(outcome==='stop')f.speech('Nova, stop',{...alice,textRevision:2});
  await f.turn();assert.ok(!f.calls.some(c=>c.name==='scape_interact'),outcome);
 }
});
test('unreachable destinations fail safely and visit does not use the object',async()=>{
 let failed=false;const f=fixture({client:decision('interact'),policy:{async onTurn(t){failed=t.events.some(e=>e.type==='action_failure'&&e.code==='target_unreachable');}}});
 f.observe({scene:{objects:[piano],blocked:[]},blocked:[{x:2,y:1},{x:0,y:1},{x:1,y:2},{x:1,y:0}]});await f.turn([f.speech('Nova, play it')]);assert.equal(failed,true);
 const g=fixture({client:decision('visit')});g.observe({scene:{objects:[piano],blocked:[]}});await g.turn([g.speech('Nova, inspect it')]);
 const move=g.calls.find(c=>c.name==='scape_move_to');g.observe({self:{...g.context.observation.self,...move.args},movement:{id:'move',status:'arrived'}});await g.turn();assert.ok(!g.calls.some(c=>c.name==='scape_interact'));
});
test('session failures stay fatal instead of being mistaken for action denials',async()=>{
 const f=fixture({client:decision('follow')});f.context.tools.call=async()=>{throw Object.assign(new Error('revoked'),{code:'stale_session'});};
 await assert.rejects(f.turn([f.speech('Nova, follow me')]),/revoked/);
});
test('smoothed mood evolves gradually and relaxes without extra inference',async()=>{
 const states=[];const f=fixture({policy:{async onTurn(t,c){states.push(t.events.at(-1).moodState);await c.tools.call('agent_behavior',{action:'mood',mood:'playful'});}}});
 await f.turn([f.speech('Nova, hello')]);await f.turn([f.speech('Nova, another',{...alice,textRevision:2})]);assert.ok(states[1].energy>states[0].energy&&states[1].energy<1);
 f.advance(300000);f.agent.tick();await f.turn([f.speech('Nova, hello again',{...alice,textRevision:3})]);assert.ok(states[2].energy<states[1].energy);
});

test('object goal timeout stops its own movement and never uses the target',async()=>{
 const f=fixture({client:decision('interact')});f.observe({scene:{objects:[piano],blocked:[]}});await f.turn([f.speech('Nova, play it')]);
 f.observe({movement:{id:'move',status:'moving'}});f.advance(45001);await f.turn();
 assert.ok(f.calls.some(c=>c.name==='scape_stop'));assert.ok(!f.calls.some(c=>c.name==='scape_interact'));
});
test('an object goal never takes over a replacement movement operation',async()=>{
 const f=fixture({client:decision('interact')});f.observe({scene:{objects:[piano],blocked:[]}});await f.turn([f.speech('Nova, play it')]);
 f.observe({movement:{id:'replacement',status:'moving'}});await f.turn();f.advance(45001);await f.turn();
 assert.ok(!f.calls.some(c=>c.name==='scape_stop'||c.name==='scape_interact'));
});
test('explicit outward wording cues are available to the conversation policy',async()=>{
 let social;const client={async evaluate(r){const values=await decision('reply').evaluate(r);values.p0_tone={choice:'hurried',probabilities:{hurried:.9,neutral:.1}};return values;}};
 const f=fixture({client,policy:{async onTurn(t){social=t.events.at(-1);}}});await f.turn([f.speech('Nova, please be brief')]);
 assert.equal(social.people.find(p=>p.id==='alice').outwardTone,'hurried');
});

test('late or superseded arrival cannot activate an old object goal',async()=>{
 for(const outcome of ['late','replacement','stopped']){
  const f=fixture({client:decision('interact')});f.observe({scene:{objects:[piano],blocked:[]}});await f.turn([f.speech('Nova, play it')]);
  const move=f.calls.find(c=>c.name==='scape_move_to');
  if(outcome==='late')f.advance(45001);
  f.observe({self:{...f.context.observation.self,...move.args},movement:{id:outcome==='replacement'?'other':'move',status:outcome==='stopped'?'stopped':'arrived'}});await f.turn();
  assert.ok(!f.calls.some(c=>c.name==='scape_interact'),outcome);
 }
});
