import type { AgentObservation as Observation } from './contracts.mjs';
export class ScapeAgent {
  constructor(options:{origin:string;token?:string;request?:typeof fetch;onToken?:(token:string)=>void|Promise<void>});
  pair(name:string):Promise<{code:string;expiresAt:number}>;
  pairingStatus():Promise<{approved:false;expiresAt:number}|{approved:true;agentId:string;room:string;name:string;expiresAt:number}>;
  enter():Promise<Observation>;
  observe():Promise<Observation>;
  speak(text:string,id?:string):Promise<{ok:true}>;
  moveTo(x:number,y:number,floor?:0|1,id?:string):Promise<{operationId:string}>;
  stop(id?:string):Promise<{ok:true}>;
  action(action:string,body?:Record<string,unknown>,id?:string):Promise<Record<string,unknown>>;
  avatar(body:Record<string,unknown>):Promise<{kind:string;emoji:string;model:string|null}>;
  watch(onObservation:(observation:Observation)=>void,onError?:(error:Error)=>void,intervalMs?:number):()=>void;
  unwatch():void;
  leave():Promise<{ok:true}>;
}
