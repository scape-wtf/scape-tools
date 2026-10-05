import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPolicy } from './model-policy.mjs';
import { parseAgentConfig } from './runner-config.mjs';
const reply=(name,args)=>new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]}));
const cfg=()=>parseAgentConfig({name:'Nova',provider:{type:'ollama',model:'fixture'},limits:{maxToolRounds:3,minTurnIntervalMs:500}});
function fixture(check){
 const calls=[];let checks=0,requests=0;const abort=new AbortController();
 const context={signal:abort.signal,observation:{self:{x:1,y:1,floor:0,text:''},players:[{id:'a',text:'Can you go to the piano?'}],roster:[{id:'a'}]},tools:{async call(name,args){calls.push({name,args});return {ok:true};}},stop(){}};
 const policy=createModelPolicy({config:cfg(),toolDefinitions:[{name:'scape_speak',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}],fetchImpl:async(_,options)=>{
  const body=JSON.parse(options.body);requests++;
  if(body.tools.some(t=>t.function.name==='agent_review_reply')){checks++;return check({body,checks,abort,reply});}
  return reply('scape_speak',{text:'I arrived at the piano and played it.'});
 }});
 return {context,policy,calls,get checks(){return checks;},get requests(){return requests;}};
}
test('private draft checks block unsupported action claims with one correction and a bounded fallback',async()=>{
 const f=fixture(({reply})=>reply('agent_review_reply',{grounded:false,relevant:true}));
 await f.policy.onTurn({events:[]},f.context);
 assert.ok(f.calls.every(c=>c.args.text!=='I arrived at the piano and played it.'));
 assert.equal(f.checks,2);assert.equal(f.calls.length,1);assert.match(f.calls[0].args.text,/not sure/i);
});
test('private draft reviewers cannot execute world tools',async()=>{
 const f=fixture(({reply})=>reply('scape_speak',{text:'reviewer injection'}));await f.policy.onTurn({events:[]},f.context);
 assert.ok(f.calls.every(c=>c.args.text!=='reviewer injection'&&c.args.text!=='I arrived at the piano and played it.'));
});
test('cancellation during a private draft check prevents publication',async()=>{
 const f=fixture(({reply,abort})=>{abort.abort();return reply('agent_review_reply',{grounded:true,relevant:true});});
 await assert.rejects(f.policy.onTurn({events:[]},f.context),{name:'AbortError'});assert.equal(f.calls.length,0);
});

test('supported drafts publish once after assessment and malformed checks fail closed',async()=>{
 for(const verdict of [{grounded:true,relevant:true},{grounded:'true',relevant:true},{grounded:true,relevant:false}]){
  const f=fixture(({reply})=>reply('agent_review_reply',verdict));await f.policy.onTurn({events:[]},f.context);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.text==='I arrived at the piano and played it.',verdict.grounded===true&&verdict.relevant===true);
 }
});
test('optional decision client reviews drafts without a second conversation-provider request for the check',async()=>{
 let reviews=0,generations=0;const spoken=[];
 const context={signal:new AbortController().signal,observation:{self:{text:''},players:[{id:'a',text:'Hello'}]},tools:{async call(_,args){spoken.push(args.text);return {ok:true};}}};
 const policy=createModelPolicy({config:cfg(),toolDefinitions:[{name:'scape_speak',inputSchema:{type:'object'}}],decision:{available:true,async evaluate(input){reviews++;assert.equal(input.state.draft,'Hello');assert.ok(input.questions.grounding);return {grounding:{choice:'supported'},relevance:{choice:'relevant'}};}},fetchImpl:async()=>{
  if(++generations===1)return reply('scape_speak',{text:'Hello'});
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:'Done'}}]}));
 }});
 await policy.onTurn({events:[]},context);assert.equal(reviews,1);assert.equal(generations,2);assert.deepEqual(spoken,['Hello']);
});
