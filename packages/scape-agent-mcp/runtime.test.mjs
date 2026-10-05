import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentActivity, mcpTools, runAgentSession } from './runtime.mjs';

const state = (revision = 1, text = '', settled = true) => ({ protocol: 1, sessionId: 'one',
  revision, observedAt: Date.now(), room: 'world', status: 'connected',
  self: { id: 'scout', name: 'Scout', x: 1, y: 1, floor: 0, text: '' },
  players: [{ id: 'visitor', name: 'Visitor', x: 2, y: 1, floor: 0, text, textRevision: revision, settled }],
  objects: [], blocked: [], movement: null,
  limits: { radius: 10, heartbeatMs: 250, idleTimeoutMs: 15000, maxSpeechLength: 320 } });
const until = async check => {
  for (let n = 0; n < 200; n++) { if (check()) return; await delay(5); }
  throw new Error('Condition did not become true');
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('thinking dots survive processing, preserve replies and clear only when no reply was published',async()=>{
  for(const published of [false,true]){
    const f=fixture(),started=deferred(),finish=deferred();
    const running=runAgentSession({tools:f.tools,initialObservation:state(),createAgent:()=>({
      async onTurn(_,context){
        await context.setThinking(true);started.resolve();await finish.promise;
        if(published)await context.tools.call('scape_speak',{text:'A readable reply'});
        await context.setThinking(false);context.stop();
      },
    })});
    await started.promise;
    assert.deepEqual(f.calls.filter(c=>c.name==='scape_speak').map(c=>c.args.text),['…']);
    finish.resolve();await running;
    assert.deepEqual(f.calls.filter(c=>c.name==='scape_speak').map(c=>c.args.text),published?['…','A readable reply']:['…','']);
  }
});

test('thinking respects an existing reply, appears on its expiry and ignores stale snapshots',async()=>{
  const initial=state();initial.self.text='Previous reply';
  const f=fixture(),started=deferred(),publish=deferred(),published=deferred(),finish=deferred();f.observation=initial;
  let ctx;
  const running=runAgentSession({tools:f.tools,initialObservation:initial,createAgent:()=>({
    async onTurn(_,context){
      ctx=context;await context.setThinking(true);started.resolve();await publish.promise;
      await context.tools.call('scape_speak',{text:'New reply'});published.resolve();await finish.promise;
      await context.setThinking(false);context.stop();
    },
  })});
  await started.promise;assert.equal(f.calls.filter(c=>c.name==='scape_speak').length,0);
  await ctx.tools.call('scape_speak',{text:ctx.thinking?'…':''});
  assert.equal(f.calls.find(c=>c.name==='scape_speak').args.text,'…');
  publish.resolve();await published.promise;
  const reads=f.reads;await until(()=>f.reads>reads+1);
  finish.resolve();await running;
  assert.deepEqual(f.calls.filter(c=>c.name==='scape_speak').map(c=>c.args.text),['…','New reply']);
});
function fixture() {
  let observation = state(), reads = 0;
  const calls = [];
  return { calls, get reads() { return reads; }, set observation(value) { observation = value; },
    tools: { async call(name, args, options = {}) {
      calls.push({ name, args });
      if (name === 'scape_observe') {
        reads++;
        await delay(5, undefined, { signal: options.signal });
        return observation;
      }
      return { ok: true };
    } } };
}

test('settled speech is delivered once per observed change, with session/visibility baselines', () => {
  const tracker = new AgentActivity();
  assert.deepEqual(tracker.update(state(1, 'old bubble')), [{ type: 'ready' }]);
  assert.deepEqual(tracker.update(state(1, 'old bubble')), []);
  assert.deepEqual(tracker.update(state(2, 'hello', false)), []);
  assert.equal(tracker.update({ ...state(2, 'hello'), revision: 3 })[0].type, 'speech');
  assert.deepEqual(tracker.update({ ...state(2, 'hello'), revision: 4 }), []);
  tracker.update({ ...state(5), players: [] });
  assert.equal(tracker.update(state(1, 'hello')).some(event => event.type === 'speech'), false);
  assert.throws(() => tracker.update({ ...state(), sessionId: 'replacement' }), /session changed/);
});

test('thinking placeholders do not trigger conversation but a subsequent reply does',()=>{
  const activity=new AgentActivity();activity.update(state());
  assert.equal(activity.update(state(2,'…')).some(e=>e.type==='speech'),false);
  assert.equal(activity.update(state(3,'...')).some(e=>e.type==='speech'),false);
  assert.equal(activity.update(state(4,'A real reply')).filter(e=>e.type==='speech').length,1);
});

test('interrupted thinking clears its indicator before the next decision without leaving',async()=>{
  const f=fixture(),shutdown=new AbortController(),started=deferred(),second=deferred();let outer,turns=0;
  const running=runAgentSession({tools:f.tools,initialObservation:state(),signal:shutdown.signal,createAgent:context=>{
    outer=context;return{async onTurn(_,turn){
      if(++turns===1){await turn.setThinking(true);started.resolve();
        try{await delay(10000,undefined,{signal:turn.signal});}finally{await turn.setThinking(false);}
      }else{assert.equal(turn.thinking,false);second.resolve();}
    }};
  }});
  try{
    await started.promise;outer.interrupt();outer.requestTurn();await second.promise;
    assert.deepEqual(f.calls.filter(c=>c.name==='scape_speak').map(c=>c.args.text),['…','']);
    assert.equal(f.calls.filter(c=>c.name==='scape_leave').length,0);
  }finally{shutdown.abort();await running;}
});

test('external agent listens during slow reasoning and handles later speech without overlapping turns', async () => {
  const f = fixture(), gate = deferred(), turns = [], seen = [], stop = new AbortController();
  let active = 0, maximum = 0;
  const running = runAgentSession({ tools: f.tools, initialObservation: state(), signal: stop.signal,
    createAgent: () => ({
      onObservation(s) { seen.push(s.revision); },
      async onTurn({ events }, context) {
        active++; maximum = Math.max(maximum, active); turns.push(events);
        if (turns.length === 1) await gate.promise;
        for (const event of events) if (event.type === 'speech') await context.tools.call('scape_speak', { text: event.player.text });
        active--;
      },
    }) });
  try {
    await until(() => turns.length === 1);
    f.observation = state(2, 'First'); await until(() => seen.includes(2));
    f.observation = state(3, 'Second'); await until(() => seen.includes(3));
    const reads = f.reads; await until(() => f.reads > reads + 2);
    assert.equal(turns.length, 1, 'no concurrent model calls');
    gate.resolve(); await until(() => f.calls.filter(c => c.name === 'scape_speak').length === 2);
    assert.deepEqual(f.calls.filter(c => c.name === 'scape_speak').map(c => c.args.text), ['First', 'Second']);
    assert.equal(maximum, 1);
    assert.match(f.calls.find(c => c.name === 'scape_speak').args.commandId, /^t\d{13}_/);
    const count = turns.length; await delay(80); assert.equal(turns.length, count, 'unchanged observations do not invoke the model');
  } finally { stop.abort(); gate.resolve(); await running; }
  assert.equal(f.calls.filter(c => c.name === 'scape_leave').length, 1);
});

test('stop leaves promptly without awaiting a model and rejects its late actions', async () => {
  const f = fixture(), gate = deferred(), late = deferred(), stop = new AbortController();
  let context;
  const running = runAgentSession({ tools: f.tools, initialObservation: state(), signal: stop.signal,
    createAgent: c => { context = c; return { async onTurn() {
      await gate.promise;
      try { await c.tools.call('scape_speak', { text: 'too late' }); late.resolve(false); }
      catch { late.resolve(true); }
    } }; } });
  await delay(0); stop.abort(); await running;
  assert.equal(context.signal.aborted, true);
  assert.equal(f.calls.at(-1).name, 'scape_leave');
  gate.resolve(); assert.equal(await late.promise, true);
  assert.ok(!f.calls.some(c => c.name === 'scape_speak'));
});

for (const fault of ['replacement', 'disconnect', 'provider']) test(`${fault} ends the session and leaves`, async () => {
  const f = fixture();
  const running = runAgentSession({ tools: f.tools, initialObservation: state(), createAgent: () => ({
    onTurn() { if (fault === 'provider') throw new Error('provider failed'); },
  }) });
  const rejected = assert.rejects(running, fault === 'replacement' ? /session changed/ : fault === 'disconnect' ? /disconnected/ : /provider failed/);
  if (fault === 'replacement') f.observation = { ...state(2), sessionId: 'two' };
  if (fault === 'disconnect') f.observation = { ...state(2), status: 'reconnecting' };
  await rejected;
  assert.equal(f.calls.filter(c => c.name === 'scape_leave').length, 1);
});

test('hidden-player queued speech is removed before the next turn', async () => {
  const f = fixture(), gate = deferred(), stop = new AbortController(), turns = [];
  let revision;
  const running = runAgentSession({ tools: f.tools, initialObservation: state(), signal: stop.signal,
    createAgent: () => ({ onObservation(s) { revision = s.revision; },
      async onTurn({ events }) { turns.push(events); if (turns.length === 1) await gate.promise; },
    }) });
  try {
    await until(() => turns.length === 1);
    f.observation = state(2, 'private now'); await until(() => revision === 2);
    f.observation = { ...state(3), players: [] }; await until(() => revision === 3);
    gate.resolve(); await until(() => turns.length === 2);
    assert.equal(turns.flat().some(e => e.type === 'speech'), false);
  } finally { gate.resolve(); stop.abort(); await running; }
});

test('a full event queue fails visibly instead of dropping conversation silently', async () => {
  const f = fixture(), gate = deferred(); let revision;
  const running = runAgentSession({ tools: f.tools, initialObservation: state(), maxPendingEvents: 1,
    createAgent: () => ({ onObservation(s) { revision = s.revision; }, onTurn: () => gate.promise }) });
  const rejected = assert.rejects(running, /queue is full/);
  await delay(0);
  f.observation = state(2, 'one'); await until(() => revision === 2);
  f.observation = state(3, 'two'); await rejected; gate.resolve();
  assert.equal(f.calls.at(-1).name, 'scape_leave');
});

test('connected readiness gates actions, owner lifecycle cannot be replaced by model tools', async () => {
  const f = fixture(); let context;
  const running = runAgentSession({ tools: f.tools, initialObservation: { ...state(), status: 'connecting', self: null },
    createAgent: c => { context = c; return {}; } });
  await assert.rejects(context.tools.call('scape_speak', { text: 'too early' }), /connected/);
  await until(() => context.observation.status === 'connected');
  await assert.rejects(context.tools.call('scape_enter'), /lifecycle/);
  context.stop(); await running;
});

test('MCP adapter passes cancellation and preserves structured tool errors', async () => {
  const signal = new AbortController().signal;
  const tools = mcpTools({ async callTool(request, schema, options) {
    assert.equal(options.signal, signal);
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'revoked', code: 'forbidden' }) }] };
  } });
  await assert.rejects(tools.call('scape_observe', {}, { signal }), error => error.code === 'forbidden');
});

test('interrupting a decision preserves presence, serializes its replacement and rejects late tools',async()=>{
  const f=fixture(),stop=new AbortController(),gate=deferred();let started=0,lateRejected=false;
  const running=runAgentSession({tools:f.tools,initialObservation:state(),signal:stop.signal,createAgent:c=>({
    onObservation(s,events){if(events.some(e=>e.type==='speech'))c.interrupt();},
    async onTurn(turn,context){
      if(++started===1){await gate.promise;try{await context.tools.call('scape_speak',{text:'stale'});}catch{lateRejected=true;}return;}
      await context.tools.call('scape_speak',{text:'current'});
    },
  })});
  try{
    await until(()=>started===1);f.observation=state(2,'changed request');await until(()=>f.reads>2);
    gate.resolve();await until(()=>started===2&&f.calls.some(c=>c.args?.text==='current'));
    assert.ok(lateRejected);assert.ok(!f.calls.some(c=>c.args?.text==='stale'||c.name==='scape_leave'));
  }finally{gate.resolve();stop.abort();await running;}
});
