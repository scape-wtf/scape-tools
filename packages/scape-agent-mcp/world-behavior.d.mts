import type { EncounterScope, EncounterContext } from './encounters.mjs';
import type { DecisionClient } from './decision.mjs';
import type { AgentConfig } from './runner.mjs';
import type { AgentContext, AgentPolicy } from './runtime.mjs';
export interface BehaviorMemory {
  encounters?: EncounterScope;
  visitors: Map<
    string,
    {
      seen: number;
      greeted: number;
      lastSeen: number;
      encounter?: EncounterContext;
      quietUntil?: number;
      spaceUntil?: number;
      toneAt?: number;
      outwardTone?: 'neutral' | 'upset' | 'hurried' | 'cheerful';
    }
  >;
}
export function createBehaviorMemory(options?: { encounters?: EncounterScope }): BehaviorMemory;
export const behaviorTool: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export const behaviorInstructions: string;
/** Supply the local behavior tool to your model; this wrapper handles it without exposing a new game endpoint. */
export function createWorldBehavior(options: {
  config: AgentConfig;
  context: AgentContext;
  policy: Required<Pick<AgentPolicy, 'onTurn'>> & Pick<AgentPolicy, 'close'>;
  decision?: DecisionClient;
  memory?: BehaviorMemory;
  now?: () => number;
}): AgentPolicy;
