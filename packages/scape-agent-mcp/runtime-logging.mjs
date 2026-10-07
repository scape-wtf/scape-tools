// Diagnostics are metadata, never serialized request/response objects or arbitrary errors.
const events = new Set([
  'runtime',
  'conversation_request',
  'decision_request',
  'decision_skip',
  'reply_review',
  'reply_adjudication',
  'reply_correction',
  'reply_fallback',
  'tool_call',
  'turn',
  'social_decision',
]);
const labels = {
  phase: ['start', 'complete', 'failed', 'cancelled', 'stopped'],
  purpose: ['conversation', 'reply_review', 'reply_correction', 'social', 'decision'],
  source: ['decision', 'conversation'],
  outcome: [
    'accepted',
    'rejected',
    'unavailable',
    'invalid',
    'fallback',
    'success',
    'failed',
    'skipped',
  ],
  reason: [
    'reply_already_published',
    'context_limit',
    'unsupported_claims',
    'irrelevant',
    'low_confidence',
    'invalid_review',
    'invalid_correction',
    'missing_speech',
    'clarification_required',
    'player_paused',
    'movement_paused',
    'task_pending',
    'task_planning_required',
    'invalid_target',
    'speech_reading',
    'action_failed',
    'review_unavailable',
    'cooldown',
    'pending_request',
    'rejected_input',
    'suspended',
    'budget_exhausted',
    'cancelled',
    'provider_http_error',
    'request_timeout',
    'turn_timeout',
    'connection_reset',
    'connection_refused',
    'dns_failure',
    'network_unreachable',
    'socket_closed',
    'tls_failure',
    'network_error',
    'unreadable_response',
    'response_too_large',
    'invalid_json',
    'invalid_answers',
    'response_incomplete',
    'invalid_response',
    'output_limit',
    'provider_error',
  ],
  recovery: ['retry', 'skip', 'suspend'],
  grounding: ['supported', 'unsupported'],
  relevance: ['relevant', 'irrelevant'],
  action: [
    'ignore',
    'reply',
    'approach',
    'follow',
    'wait',
    'quiet',
    'give_space',
    'resume',
    'clarify',
    'visit',
    'interact',
  ],
  activity: ['greet', 'explore', 'stay'],
  tool: ['speech', 'behavior', 'movement', 'leave', 'other'],
  toolName: [
    'scape_speak',
    'scape_observe',
    'scape_move_to',
    'scape_step',
    'scape_stop',
    'scape_leave',
    'scape_interact',
    'scape_expression',
    'scape_avatar_files',
    'scape_world_status',
    'scape_set_avatar',
    'scape_follow',
    'scape_approach',
    'scape_guide',
    'scape_avatar_catalog',
    'agent_behavior',
    'agent_task',
  ],
};
const numbers = new Set([
  'turn',
  'request',
  'attempt',
  'durationMs',
  'retryMs',
  'calls',
  'limit',
  'status',
  'events',
  'players',
  'toolCalls',
  'groundingProbability',
  'relevanceProbability',
  'threshold',
  'inputBytes',
]);
const booleans = new Set(['grounded', 'relevant']);

export function createRuntimeLogger(logging, log = () => {}, onEvent = () => {}) {
  return (event, fields = {}) => {
    if (!events.has(event)) return;
    const safe = [];
    const metadata = {};
    for (const [key, value] of Object.entries(fields)) {
      if (
        (Object.hasOwn(labels, key) && labels[key].includes(value)) ||
        (numbers.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) ||
        (booleans.has(key) && typeof value === 'boolean')
      ) {
        safe.push(`${key}=${value}`);
        metadata[key] = value;
      }
    }
    // A diagnostic sink must never change an action, retry, or cancellation outcome.
    try {
      onEvent({ type: 'diagnostic', event, ...metadata });
      if (logging?.level === 'debug')
        log(`${new Date().toISOString()} [debug] ${event} ${safe.join(' ')}`.trimEnd());
    } catch {}
  };
}
