export interface DecisionConfig {
  type: 'openrouter' | 'typesafe' | 'cloudflare' | 'system-one' | 'openai-compatible' | 'custom';
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string | null;
  accountId?: string;
  adapter?: string;
  timeoutMs?: number;
  maxRequests?: number;
  minIntervalMs?: number;
}
export type DecisionQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };
export type DecisionAnswer = (
  | { type: 'choice'; choice: string }
  | { type: 'score'; score: number }
  | { type: 'noul'; noul: number }
) & { confidence?: number; probabilities?: Record<string, number> };
export interface DecisionRequest {
  state: unknown;
  questions: Record<string, DecisionQuestion>;
}
/** Trusted owner-side code. Honor cancellation; never log secrets or send them in state. */
export interface DecisionAdapter {
  evaluate(
    request: DecisionRequest,
    options: { signal: AbortSignal },
  ): Promise<{ answers: Record<string, DecisionAnswer> }>;
  close?(): void | Promise<void>;
}
/** Default export of a custom adapter module. Receives no world tools or Scape credentials. */
export type DecisionAdapterFactory = (options: {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}) => DecisionAdapter | Promise<DecisionAdapter>;
export interface DecisionClient {
  /** False during cooldown, an unsettled timed-out call, suspension, or after close. */
  readonly available: boolean;
  /** Serial calls only. Null means fallback; fresh evaluations resume after transient cooldown.
   * Rejected identical input is skipped. Every provider attempt consumes the request budget. */
  evaluate(
    request: DecisionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, DecisionAnswer> | null>;
  close(): Promise<void>;
}
export function createDecisionClient(options: {
  config: DecisionConfig;
  apiKey?: string;
  directory?: string;
  fetchImpl?: typeof fetch;
  onStatus?: (message: string) => void;
  onState?: (state: string) => void;
  /** Content-free metadata; intended for owner-side diagnostics. */
  onDiagnostic?: (event: string, fields: Record<string, unknown>) => void;
  now?: () => number;
}): Promise<DecisionClient>;
export function validateDecisionAnswers(
  questions: Record<string, DecisionQuestion>,
  answers: unknown,
): Record<string, DecisionAnswer>;
