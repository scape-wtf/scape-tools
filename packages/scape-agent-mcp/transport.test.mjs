import test from 'node:test';
import assert from 'node:assert/strict';
import { ScapeAgent } from './transport.mjs';
const flush = async () => { for(let i=0;i<12;i++)await Promise.resolve(); };

test('runner keeps pairing credentials out of returned data and scopes commands to the admitted session', async()=>{
  const calls=[];
  const agent=new ScapeAgent({origin:'https://scape.test',request:async(url,init)=>{
    calls.push({url,init,body:JSON.parse(init.body)});
    if(url.endsWith('/link/start'))return Response.json({code:'ABCD',secret:'private-token',expiresAt:100});
    if(url.endsWith('/enter'))return Response.json({sessionId:'session-1'});
    return Response.json({ok:true});
  }});
  assert.deepEqual(await agent.pair('Scout'),{code:'ABCD',expiresAt:100});
  assert.equal(calls[0].init.headers.Authorization,undefined);
  await agent.enter();await agent.moveTo(2,3,0,'movement-command');await agent.speak('Hi','speech-command');await agent.stop();await agent.leave();
  for(const call of calls.slice(1)) {
    assert.equal(call.init.headers.Authorization,'Bearer private-token');
    assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'error');
  }
  assert.deepEqual(calls[2].body,{sessionId:'session-1',id:'movement-command',x:2,y:3,floor:0});
  assert.equal(calls[3].body.text,'Hi');assert.equal(calls[5].body.sessionId,'session-1');
  assert.throws(()=>new ScapeAgent({origin:'http://remote.test'}));
  assert.throws(()=>new ScapeAgent({origin:'https://secret@scape.test'}));
});

test('restarting observation while a response is pending keeps polling and ignores the old callback', async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let release,calls=0,first=0,second=0;
  const agent=new ScapeAgent({origin:'https://scape.test',request:async()=>{
    calls++;if(calls===1)await new Promise(resolve=>release=resolve);
    return Response.json({sessionId:'sample'});
  }});
  t.after(()=>agent.unwatch());
  const stopOld=agent.watch(()=>first++);agent.watch(()=>second++);stopOld();
  assert.equal(calls,1);release();await flush();assert.equal(first,0);
  t.mock.timers.tick(2000);await flush();assert.equal(calls,2);assert.equal(second,1);
  agent.unwatch();t.mock.timers.tick(4000);await flush();assert.equal(calls,2);
});

test('observation errors stop the heartbeat instead of silently maintaining presence', async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0,errors=[];
  const agent=new ScapeAgent({origin:'https://scape.test',request:async()=>{calls++;return Response.json({code:'access_revoked',error:'Revoked'},{status:403});}});
  agent.watch(()=>assert.fail('no observation expected'),error=>errors.push(error));await flush();
  t.mock.timers.tick(10_000);await flush();assert.equal(calls,1);assert.equal(errors[0].code,'access_revoked');
});

test('a revoked session can be left locally and paired again without restarting the process', async () => {
  const agent = new ScapeAgent({ origin: 'https://scape.test', request: async url => {
    if(url.endsWith('/enter')) return Response.json({sessionId:'old'});
    if(url.endsWith('/leave')) return Response.json({error:'Revoked',code:'unauthorized'},{status:401});
    return Response.json({code:'NEW',secret:'new-secret',expiresAt:123});
  }});
  await agent.enter(); await assert.rejects(agent.leave(),/Revoked/);
  assert.deepEqual(await agent.pair('Scout'),{code:'NEW',expiresAt:123});
});
