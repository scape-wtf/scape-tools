import type { DecisionConfig } from './decision.mjs';
export interface AgentBehaviorSettings {
  enabled: boolean;
  explore: boolean;
  expressions: boolean;
  checkReplies: boolean;
  spaceDistance: number;
  idleMs: number;
  quietMs: number;
  greetingCooldownMs: number;
  sleepAfterMs: number;
  wakeIntervalMs: number;
}
export interface AgentConfig {
  name: string;
  instructions: string;
  avatar: {
    kind: 'emoji' | 'image' | 'glb' | 'catalog';
    emoji: string;
    asset?: string;
    preset?: string;
  };
  provider?: { type: string; model: string; baseUrl: string; apiKeyEnv: string | null };
  policy?: string;
  decision?: DecisionConfig;
  memory: { enabled: boolean };
  behavior: AgentBehaviorSettings;
  limits: {
    turnTimeoutMs: number;
    maxToolRounds: number;
    maxOutputTokens: number;
    historyTurns: number;
    maxModelCalls: number;
    minTurnIntervalMs: number;
  };
}
export function parseAgentConfig(value: unknown): AgentConfig;
export function validateEndpoint(value: string, originOnly?: boolean): string;
export const providerPresets: Record<
  string,
  { baseUrl: string; apiKeyEnv: string | null; local?: boolean }
>;
export const decisionPresets: Record<
  string,
  { baseUrl?: string; model?: string; apiKeyEnv: string | null }
>;
export function runAgent(options: {
  directory?: string;
  origin: string;
  signal?: AbortSignal;
  log?: (message: string) => void;
  config?: unknown;
  apiKey?: string;
  decisionApiKey?: string;
  token?: string;
  assetDirectory?: string;
  memoryDirectory?: string;
  onState?: (state: string) => void;
}): Promise<void>;
export function checkAgentAccess(options: {
  origin: string;
  token: string;
}): Promise<{ approved: boolean; expired?: boolean; room?: string }>;
export function pairAgent(options: {
  origin: string;
  name: string;
  signal?: AbortSignal;
  onCode?: (pair: { code: string; expiresAt: number }) => void;
}): Promise<{ token: string; approved: boolean; room?: string }>;
