import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { agentContractArtifacts, generateAgentContracts } from '../../tools/dev/agent-contracts.mjs';

test('packaged agent types and limits match the canonical host wire contract', async () => {
  await generateAgentContracts(true);
  for (const content of Object.values(await agentContractArtifacts())) {
    assert.doesNotMatch(content, /(?:import|from)\s*['"]|@koro\/|@scape\/|node:/);
  }
  const transport = await readFile(new URL('./transport.d.mts', import.meta.url), 'utf8');
  assert.match(transport, /AgentObservation as Observation/);
  assert.doesNotMatch(transport, /interface Observation/);
});
