import type { AgentSessionOptions } from './runtime.mjs';
/** Vacant-world departure and return; does not retry failed or revoked access. */
export function runAgentPresence(
  options: Pick<AgentSessionOptions, 'tools' | 'initialObservation' | 'createAgent'> & {
    signal: AbortSignal;
    sleepAfterMs?: number;
    wakeIntervalMs?: number;
    onState?: (state: 'sleeping' | 'connecting' | 'listening') => void;
    onEnter?: () => Promise<unknown> | void;
  },
): Promise<void>;
