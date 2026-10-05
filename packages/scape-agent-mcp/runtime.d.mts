import type { AgentObservation, AgentMovement, AgentPursuit } from './contracts.mjs';

export interface AgentTools {
  call(name: string, args?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
}
/** A connected MCP client. Model/provider configuration stays with its owner. */
export function mcpTools(client: {
  callTool(request: { name: string; arguments: Record<string, unknown> }, schema?: undefined,
    options?: { signal?: AbortSignal }): Promise<{
      isError?: boolean; structuredContent?: unknown;
      content: Array<{ type: string; text?: string }>;
    }>;
}): AgentTools;

export type AgentEvent =
  | { type: 'ready' }
  | { type: 'idle' }
  | { type: 'social'; focus?: string; greeting?: string; people: Array<{id:string;mayGreet:boolean;encounter?:import('./encounters.mjs').EncounterContext;quiet?:boolean;outwardTone?:'neutral'|'upset'|'hurried'|'cheerful'}>;
      waiting: boolean; quiet: boolean; clarify?: boolean; history?: Array<Record<string,unknown>>; recentActions?: Array<Record<string,unknown>>; moodState?: {valence:number;warmth:number;energy:number;openness:number}; bodyIntent?: 'relaxed'|'attentive'|'lively'|'subdued'; mood: 'neutral'|'warm'|'curious'|'concerned'|'playful' }
  | { type: 'action_failure'; code:string; player?:string }
  | { type: 'speech'; player: AgentObservation['players'][number] }
  | { type: 'participants'; joined: string[]; left: string[] }
  | { type: 'movement'; operation: AgentMovement }
  | { type: 'pursuit'; operation: AgentPursuit };

/** Best-effort snapshot differences within one session; not durable chat delivery. */
export class AgentActivity {
  update(observation: AgentObservation): AgentEvent[];
}
export interface AgentContext {
  readonly observation: AgentObservation;
  readonly signal: AbortSignal;
  readonly tools: AgentTools;
  readonly thinking: boolean;
  /** Withdraw presence and reject subsequent actions from this session. */
  stop(): void;
  /** Abort the current decision and prevent its later tools; keep observing. */
  interrupt(): void;
  /** Schedule one coalesced idle decision using the normal serialized queue. */
  requestTurn(): void;
  /** Show thinking dots through public speech tools without replacing a visible reply. */
  setThinking(thinking: boolean): Promise<void>;
}
export interface AgentPolicy {
  /** Synchronous perception update, including during an outstanding model turn. */
  onObservation?(observation: AgentObservation, events: AgentEvent[], context: AgentContext): void;
  /** At most one turn at a time. Waiting for activity makes no model calls. */
  onTurn?(turn: { observation: AgentObservation; events: AgentEvent[] }, context: AgentContext): Promise<void> | void;
  /** Optional synchronous local behavior tick, separate from model scheduling. */
  tick?(now: number, context: AgentContext): void;
  /** Dispose local policy resources after departure; honor context.signal. */
  close?(): Promise<void> | void;
}
export interface AgentSessionOptions {
  tools: AgentTools;
  initialObservation: AgentObservation;
  createAgent(context: AgentContext): AgentPolicy;
  signal?: AbortSignal;
  /** Long-poll duration, 1–25000 ms; defaults to 1000. */
  observeWaitMs?: number;
  /** Optional policy tick interval, at least 10 ms; defaults to 40. */
  tickMs?: number;
  /** Stop instead of silently dropping excess pending activity; defaults to 128. */
  maxPendingEvents?: number;
}
/** Own one entered session until stop, cancellation or failure. Always leave on exit. */
export function runAgentSession(options: AgentSessionOptions): Promise<void>;
