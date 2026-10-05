import { setTimeout as delay } from 'node:timers/promises';
import { runAgentSession } from './runtime.mjs';

/** Sleep is voluntary vacancy handling, never recovery from revoked or broken access. */
export async function runAgentPresence({ tools, initialObservation, createAgent, signal,
  sleepAfterMs = 30000, wakeIntervalMs = 5000, onState = () => {}, onEnter = async () => {},
  now = Date.now, wait = delay, session = runAgentSession }) {
  if(!Number.isInteger(sleepAfterMs)||sleepAfterMs<1||!Number.isInteger(wakeIntervalMs)||wakeIntervalMs<1)throw new Error('Use positive integer sleep and wake intervals.');
  let observation=initialObservation;
  while(!signal.aborted){
    let sleeping=false,lastOccupied=now();
    await session({tools,initialObservation:observation,signal,createAgent:context=>{
      const policy=createAgent(context);
      return {...policy,onObservation(state,events,ctx){
        if((state.roster??state.players).length)lastOccupied=now();
        if(now()-lastOccupied>=sleepAfterMs){sleeping=true;context.stop();return;}
        policy.onObservation?.(state,events,ctx);
      }};
    }});
    if(!sleeping||signal.aborted)return;
    onState('sleeping');
    do{
      await wait(wakeIntervalMs,undefined,{signal});
      const status=await tools.call('scape_world_status',{}, {signal});
      if(Number(status.potentialParticipants)>0)break;
    }while(!signal.aborted);
    signal.throwIfAborted();onState('connecting');
    const entry=await tools.call('scape_enter',{}, {signal});
    if(!entry.entered||!entry.observation)throw new Error('World access ended while the agent was sleeping. Pair again before restarting.');
    observation=entry.observation;
    await onEnter();onState('listening');
  }
}
