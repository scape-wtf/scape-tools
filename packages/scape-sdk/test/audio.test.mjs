import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGizmoSynth,gizmoSynthError,gizmoSoundsError,renderGizmoSound,encodeGizmoWav} from '../dist/index.js';

const patch={kind:'synth',duration:.4,seed:17,voices:[{wave:'sine',start:0,duration:.2,frequency:440,gain:[{time:0,value:0},{time:.01,value:.5},{time:.2,value:0}]}]};
const energy=(channel,start,end)=>channel.slice(Math.floor(start*48000),Math.floor(end*48000)).reduce((n,x)=>n+x*x,0);

test('portable synthesis is deterministic, stereo, bounded and responds to sound design changes',()=>{
  for(const wave of ['sine','triangle','square','sawtooth','noise']){
    const sound={...patch,voices:[{...patch.voices[0],wave}]},a=renderGizmoSynth(sound),b=renderGizmoSynth(sound);
    assert.equal(a.rate,48000);assert.equal(a.samples.length,2);assert.equal(a.samples[0].length,19200);
    assert.deepEqual(a,b);assert.ok(a.samples.every(c=>c.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)));
    assert.ok(energy(a.samples[0],.01,.18)>.01);assert.equal(a.samples[0][0],0);assert.equal(a.samples[0].at(-1),0);
  }
  const noise={...patch,voices:[{...patch.voices[0],wave:'noise',pan:-1}]};
  const a=renderGizmoSynth(noise);assert.equal(energy(a.samples[1],0,.4),0);
  assert.notDeepEqual(a.samples[0],renderGizmoSynth({...noise,seed:18}).samples[0]);
  const sweep=renderGizmoSynth({...patch,voices:[{...patch.voices[0],frequency:[{time:0,value:100},{time:.2,value:2000,curve:'exponential'}]}]});
  assert.notDeepEqual(sweep.samples[0],renderGizmoSynth(patch).samples[0]);
});

test('shared synthesis implements filters, delay and reverb without instrument presets',()=>{
  const dry=renderGizmoSynth(patch).samples[0];
  for(const type of ['delay','reverb']){
    const effect=type==='delay'?{type,time:.15,feedback:.4,mix:.5}:{type,decay:.6,mix:.5};
    const wet=renderGizmoSynth({...patch,effects:[effect]}).samples[0];
    assert.equal(energy(dry,.22,.38),0);assert.ok(energy(wet,.22,.38)>.0001);
  }
  const base={...patch,voices:[{wave:'sine',start:0,duration:.2,frequency:8000,gain:.5}]};
  const filtered=renderGizmoSynth({...base,effects:[{type:'lowpass',frequency:300,q:.7}]}).samples[0];
  assert.ok(energy(filtered,.02,.18)<energy(renderGizmoSynth(base).samples[0],.02,.18)*.001);
  for(const type of ['lowpass','highpass','bandpass']){
    const result=renderGizmoSynth({...base,voices:[{...base.voices[0],wave:'noise',filter:{type,frequency:16000,q:20}}],effects:[{type:'delay',time:.005,feedback:.85,mix:1}]});
    assert.ok(result.samples.every(c=>c.every(x=>Number.isFinite(x)&&Math.abs(x)<=1)));
  }
});

test('procedural validation reports exact fields and bounds before allocating samples',()=>{
  for(const [value,field] of [
    [{...patch,duration:Infinity},'duration'],[{...patch,voices:Array(17).fill(patch.voices[0])},'voices'],
    [{...patch,voices:[{...patch.voices[0],frequency:NaN}]},'frequency'],
    [{...patch,voices:[{...patch.voices[0],gain:[{time:0,value:0},{time:.1,value:1,curve:'exponential'}]}]},'positive endpoints'],
    [{...patch,voices:[{...patch.voices[0],start:.3}]},'extends beyond'],
    [{...patch,effects:[{type:'delay',time:0,feedback:1,mix:1}]},'time'],
    [{...patch,kind:'chime'},'kind'],[{...patch,url:'https://example.test/sound'},'unsupported field'],
    [{...patch,duration:10,voices:Array(4).fill({...patch.voices[0],duration:10})},'synthesis work'],
  ]){assert.ok(gizmoSynthError(value).includes(field));assert.throws(()=>renderGizmoSynth(value));}
  assert.match(gizmoSoundsError({custom:{...patch,voices:[{...patch.voices[0],gain:5}]}}),/sounds.custom.voices\[0\].gain/);
  assert.equal(gizmoSoundsError({custom:patch}),null);
});

test('recorded files remain an optional source through the same sample contract',()=>{
  const wav=encodeGizmoWav([new Float32Array([0,.2,-.2,0])],8000);
  const rendered=renderGizmoSound(wav);assert.equal(rendered.rate,8000);assert.equal(rendered.samples[0].length,4);
  assert.equal(gizmoSoundsError({recording:wav,generated:patch}),null);
});

test('BUG-141: diffuse convolution matches direct linear convolution without wrapping its tail', async () => {
  const { convolveSignal, noiseImpulse } = await import('../dist/synthesisConvolution.js');
  const input = Float32Array.from({length:257}, (_,i) => i < 40 ? Math.sin(i * .31) * .1 : 0);
  const impulse = Float32Array.from({length:43}, (_,i) => Math.cos(i * .17) * .03);
  const actual = convolveSignal(input, impulse);
  for (let i=0;i<input.length;i++) {
    let expected=0;
    for(let j=0;j<impulse.length&&j<=i;j++) expected+=input[i-j]*impulse[j];
    assert.ok(Math.abs(actual[i]-expected)<1e-8, `linear convolution at ${i}`);
  }
  const response=noiseImpulse(.05,2.8,17,48000);
  assert.deepEqual(response,noiseImpulse(.05,2.8,17,48000));
  assert.notDeepEqual(response[0],response[1]);
  const rms=Math.sqrt(response.flatMap(c=>Array.from(c)).reduce((sum,x)=>sum+x*x,0)/(2*response[0].length));
  assert.ok(Math.abs(rms-.00125*44100/48000)<1e-10);
});

test('BUG-141: parallel effects preserve the dry strike and produce a diffuse stereo tail', () => {
  const sound={...patch,duration:.6,voices:[{...patch.voices[0],duration:.1,gain:.1}]};
  const dry=renderGizmoSynth(sound);
  const delay={type:'delay',time:.15,feedback:.12,mix:.18,parallel:true};
  const delayed=renderGizmoSynth({...sound,effects:[delay]});
  assert.deepEqual(delayed.samples[0].slice(0,4000),dry.samples[0].slice(0,4000));
  const reverb={type:'noise-reverb',duration:.4,decay:2.8,seed:145028,mix:.38,parallel:true};
  const reverbed=renderGizmoSynth({...sound,effects:[reverb]});
  const combined=renderGizmoSynth({...sound,effects:[delay,reverb]});
  for(let i=480;i<24000;i+=47) assert.ok(Math.abs(combined.samples[0][i]-(delayed.samples[0][i]+reverbed.samples[0][i]-dry.samples[0][i]))<1e-7);
  assert.ok(energy(reverbed.samples[0],.12,.4)>1e-6);
  assert.notDeepEqual(reverbed.samples[0],reverbed.samples[1]);
  for(const invalid of [{...reverb,duration:4},{...reverb,decay:Infinity},{...reverb,seed:1.2},{...reverb,parallel:'yes'}])
    assert.ok(gizmoSynthError({...sound,effects:[invalid]}));
  assert.match(gizmoSynthError({...sound,effects:[reverb,reverb]}),/at most one/);
});
