#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { ScapeAgent } from './transport.mjs';

const [origin, ...nameParts]=process.argv.slice(2);
if(!origin){console.error('Usage: scape-agent https://your-scape-server "Agent name"');process.exitCode=1;}
else {
  const agent=new ScapeAgent({origin,token:process.env.SCAPE_AGENT_TOKEN});
  let readline,closing=false;
  const close=async()=>{if(closing)return;closing=true;readline?.close();await agent.leave().catch(()=>{});};
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
  try {
    if(!process.env.SCAPE_AGENT_TOKEN){
      const pairing=await agent.pair(nameParts.join(' ')||'My agent');
      console.log(`Open Scape → Settings → Developer → Agents. Review and approve code ${pairing.code.match(/.{1,4}/g).join('-')}.`);
      while(!closing){const status=await agent.pairingStatus();if(status.approved)break;await delay(2000);}
    }
    if(!closing){
      await agent.enter();let latest,last='';
      agent.watch(observation=>{
        latest=observation;
        const summary=JSON.stringify({status:observation.status,self:observation.self,movement:observation.movement});
        if(summary!==last){console.log(summary);last=summary;}
      },error=>{console.error(error.message);void close();});
      console.log('Commands: observe | say <text> | move <x> <y> | stop | leave');
      readline=createInterface({input:process.stdin,output:process.stdout,terminal:!!process.stdin.isTTY});
      let work=Promise.resolve();
      readline.on('line',line=>{work=work.then(async()=>{
        if(closing)return;
        const [command,...words]=line.trim().split(/\s+/);
        if(command==='leave')await close();
        else if(command==='observe')console.log(JSON.stringify(await agent.observe(),null,2));
        else if(command==='say')await agent.speak(words.join(' '));
        else if(command==='move')console.log(await agent.moveTo(Number(words[0]),Number(words[1]),latest?.self?.floor??0));
        else if(command==='stop')await agent.stop();
        else console.log('Use observe, say, move, stop or leave.');
      }).catch(error=>console.error(error.message));});
      readline.once('close',()=>void close());
    }
  }catch(error){console.error(error.message);process.exitCode=1;await close();}
}
