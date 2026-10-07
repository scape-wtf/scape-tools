import { openConversationNotes } from '@scape-wtf/agent-mcp/notes';
import { openEncounterMemory } from '@scape-wtf/agent-mcp/memory';
import { parseAgentConfig } from '@scape-wtf/agent-mcp/runner';
import { profileDirectory, readProfile, saveProfile, lockProfile } from './profile.mjs';
import { terminal } from './terminal.mjs';
export async function memoryCommand(
  args,
  { directory = profileDirectory(), ui = terminal() } = {},
) {
  const notes = args[0] === 'notes';
  if (notes) args = args.slice(1);
  const [action = 'list', id] = args;
  if (
    !['list', 'forget', 'clear', 'enable', 'disable'].includes(action) ||
    args.length > (action === 'forget' ? 2 : 1) ||
    (action === 'forget' && !id)
  )
    throw new Error('Use scape agent memory list, forget <visitor-id>, clear, enable or disable.');
  let release, store;
  try {
    ui.heading(notes ? 'Conversation notes' : 'Encounter memory');
    if (action !== 'list') release = await lockProfile(directory);
    const profile = await readProfile(directory);
    if (!profile) {
      ui.line('No agent configured. Start with scape agent run.');
      return;
    }
    if (['enable', 'disable'].includes(action)) {
      const config = parseAgentConfig({
        ...profile.config,
        memory: {
          ...profile.config.memory,
          [notes ? 'conversationNotes' : 'enabled']: action === 'enable',
        },
      });
      await saveProfile(directory, { ...profile, config });
      if (notes) {
        ui.success(
          `Conversation notes ${action === 'enable' ? 'enabled' : 'disabled'} for the next run. Existing notes remain until forgotten or expired.`,
        );
        return;
      }
      ui.success(
        action === 'enable'
          ? 'Encounter memory enabled for the next run.'
          : 'Encounter memory disabled. Existing records remain; use scape agent memory clear to remove them.',
      );
      return;
    }
    if (notes) {
      store = await openConversationNotes({ directory, readOnly: action === 'list' });
      if (action === 'list') {
        for (const note of store.list()) {
          ui.line(`${note.id} · ${note.room}`);
          ui.line(note.text);
        }
        if (!store.list().length) ui.line('No saved conversation notes.');
      } else if (action === 'forget') await store.forget(id);
      else for (const note of store.list()) await store.forget(note.id);
      return;
    }
    store = await openEncounterMemory({ directory, readOnly: action === 'list' });
    if (action === 'list') {
      const records = store.list().sort((a, b) => b.lastSeen - a.lastSeen);
      const enabled =
        profile.config.memory?.enabled !== false && profile.config.behavior?.enabled !== false;
      ui.line(
        `${enabled ? 'Enabled' : 'Temporary only'} · ${records.length} remembered encounter${records.length === 1 ? '' : 's'} · 30-day retention`,
      );
      ui.line('Visitor IDs identify local records. No names or conversations are stored.', 'muted');
      for (const record of records) {
        ui.line(`${record.id}  ${record.agent} · ${record.room}`);
        ui.line(`Last seen ${new Date(record.lastSeen).toISOString()} · ${record.origin}`, 'muted');
      }
      if (!records.length) ui.line('No saved encounters yet. Run your agent and meet someone.');
      return;
    }
    if (action === 'clear') store.clear();
    else store.forget(id);
    await store.flush();
    ui.success(action === 'clear' ? 'Encounter memory cleared.' : 'Encounter forgotten.');
  } finally {
    try {
      await store?.close();
    } finally {
      await release?.();
      ui.close();
    }
  }
}
