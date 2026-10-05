import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGizmoSound, gizmoNoiseSoundError, gizmoLightError, gizmoAmbienceError } from '../dist/index.js';
import { ObjectRegistry } from '../dist/runtime.js';
const noise={kind:'noise',duration:1,seed:1,layers:[{frequency:900,gain:.2}],modulation:{base:1,waves:[]},fade:.02};
const light={radiusCells:3,color:'#88aaff',intensity:.1,illumination:.8};

test('authors can build a noise sound and world light without any built-in recipe',()=>{
  const definition={type:'custom.air',version:1,emoji:'💠',label:'Air',initial:()=>({}),valid:s=>s!==null&&typeof s==='object',actions:{},light,sounds:{air:noise}};
  assert.ok(new ObjectRegistry([definition]).create('💠','custom-air-instance'));
  const {samples:[data]}=renderGizmoSound(noise);
  assert.ok(data.some(n=>n!==0));assert.ok(data.every(n=>Number.isFinite(n)&&Math.abs(n)<=1));
  const muted=renderGizmoSound({...noise,layers:[{frequency:900,gain:0}]}).samples[0];assert.ok(muted.every(n=>n===0));
});

test('invalid noise shapes, nonfinite numbers and excessive work fail with precise fields',()=>{
  for(const [patch,field] of [
    [{duration:13},'duration'],[{seed:NaN},'seed'],[{seed:1.2},'seed'],[{fade:0},'fade'],
    [{layers:null},'layers'],[{layers:[null]},'layers'],[{layers:Array(8).fill({frequency:900,gain:1}),duration:12},'layers'],
    [{layers:[{frequency:Infinity,gain:.1}]},'frequency'],[{modulation:null},'modulation'],
    [{modulation:{base:1,waves:[{speed:1,amount:.1}]}},'modulation'],[{grains:null},'grains'],
    [{grains:{start:0,end:.9,interval:[.01,.1],duration:[.01,.02],amplitude:[0,1],bias:1,smoothing:.5,attack:.001,decay:.2}},'interval'],
  ]) assert.match(gizmoNoiseSoundError({...noise,...patch}),new RegExp(field));
  assert.throws(()=>renderGizmoSound({...noise,duration:Infinity}),/duration/);
});

test('world light and ambience bounds reject malformed author settings before rendering',()=>{
  for(const [patch,field] of [
    [{radiusCells:Infinity},'radiusCells'],[{color:'red'},'color'],[{intensity:2},'intensity'],[{illumination:-1},'illumination'],
    [{falloff:null},'falloff'],[{motion:null},'motion'],[{falloff:{start:0,edge:1,power:0}},'power'],
    [{motion:{phase:[0,0],bias:0,bands:[[100,.2,0]]}},'bands'],
    [{motion:{phase:[0,0],bias:0,bands:[],drift:null}},'drift'],
    [{motion:{phase:[0,0],bias:0,bands:[],flare:[1,.8,.2,.1,0]}},'flare'],
  ]) assert.match(gizmoLightError({...light,...patch}),new RegExp(field));
  const ambience={sounds:[{sound:'air',gain:.2,rate:1,pan:0,weight:1}],intervalSeconds:[1,2],chance:1,rangeCells:[1,5],maxSources:3,stereo:1,loop:true,duckWhileSpeaking:true};
  for(const patch of [{duckGain:2},{normalizeSources:'yes'},{loopPhase:[Infinity,1]},{loopPhase:[1]}])
    assert.ok(gizmoAmbienceError({...ambience,...patch},{air:noise}));
});
