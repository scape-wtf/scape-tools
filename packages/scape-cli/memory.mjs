import {openEncounterMemory} from '@scape-wtf/agent-mcp/memory';
import {parseAgentConfig} from '@scape-wtf/agent-mcp/runner';
import {profileDirectory,readProfile,saveProfile,lockProfile} from './profile.mjs';
import {terminal} from './terminal.mjs';
export async function memoryCommand(args,{directory=profileDirectory(),ui=terminal()}={}){
  const [action='list',id]=args;
  if(!['list','forget','clear','enable','disable'].includes(action)||args.length>(action==='forget'?2:1)||action==='forget'&&!id)throw new Error('Use scape agent memory list, forget <visitor-id>, clear, enable or disable.');
  let release,store;
  try{
    ui.heading('Encounter memory');
    if(action!=='list')release=await lockProfile(directory);
    const profile=await readProfile(directory);
    if(!profile){ui.line('No agent configured. Start with scape agent run.');return;}
    if(['enable','disable'].includes(action)){
      const config=parseAgentConfig({...profile.config,memory:{enabled:action==='enable'}});
      await saveProfile(directory,{...profile,config});ui.success(action==='enable'?'Encounter memory enabled for the next run.':'Encounter memory disabled. Existing records remain; use scape agent memory clear to remove them.');return;
    }
    store=await openEncounterMemory({directory,readOnly:action==='list'});
    if(action==='list'){
      const records=store.list().sort((a,b)=>b.lastSeen-a.lastSeen);
      const enabled=profile.config.memory?.enabled!==false&&profile.config.behavior?.enabled!==false;
      ui.line(`${enabled?'Enabled':'Temporary only'} · ${records.length} remembered encounter${records.length===1?'':'s'} · 30-day retention`);
      ui.line('Visitor IDs identify local records. No names or conversations are stored.','muted');
      for(const record of records){ui.line(`${record.id}  ${record.agent} · ${record.room}`);ui.line(`Last seen ${new Date(record.lastSeen).toISOString()} · ${record.origin}`,'muted');}
      if(!records.length)ui.line('No saved encounters yet. Run your agent and meet someone.');return;
    }
    if(action==='clear')store.clear();else store.forget(id);
    await store.flush();ui.success(action==='clear'?'Encounter memory cleared.': 'Encounter forgotten.');
  }finally{try{await store?.close();}finally{await release?.();ui.close();}}
}
