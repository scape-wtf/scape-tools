import { networkFailureReason } from './recovery.mjs';

const explanations = {
  provider_http_error: 'The provider rejected the request.',
  context_limit:
    'The input exceeds the model’s context limit. Reduce the supplied context or history.',
  request_timeout: 'The provider request exceeded its time limit.',
  turn_timeout: 'The conversation turn exceeded its time limit.',
  connection_reset: 'The provider connection was reset.',
  connection_refused: 'The provider endpoint refused the connection.',
  dns_failure: 'The provider hostname could not be resolved.',
  network_unreachable: 'The network could not reach the provider.',
  socket_closed: 'The provider connection closed before completion.',
  tls_failure: 'The provider secure connection could not be verified.',
  network_error: 'The provider request failed before a response arrived.',
  unreadable_response: 'The provider response could not be read.',
  response_too_large: 'The provider response exceeded the size limit.',
  invalid_json: 'The provider returned invalid JSON.',
  invalid_answers: 'Decision answers did not match the requested types, options or probabilities.',
  response_incomplete: 'The provider returned an incomplete response.',
  invalid_response: 'The provider returned an invalid message or tool call.',
  output_limit: 'The model reached its output-token limit. Check limits.maxOutputTokens.',
  provider_error: 'The provider or adapter failed without a recognized diagnostic.',
};

/** Fixed identifiers only: never propagate provider bodies, URLs or arbitrary errors. */
export function providerFailure(reason, status) {
  const safe = Object.hasOwn(explanations, reason) ? reason : 'provider_error';
  return Object.assign(new Error(explanations[safe]), {
    code: 'provider_unavailable',
    reason: safe,
    ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { status } : {}),
  });
}

export function providerFailureMessage(error, kind, timeoutMs, now = new Date(), recovery = {}) {
  const failure = providerFailure(
    error?.reason ?? (error?.name === 'TimeoutError' ? 'request_timeout' : 'provider_error'),
    error?.status,
  );
  const { reason, status } = failure;
  let explanation = explanations[reason];
  if (status === 401)
    explanation = 'The provider rejected the credentials. Check the selected API key.';
  else if (status === 403)
    explanation = 'The provider denied access. Check model permissions and account restrictions.';
  else if (status === 402)
    explanation = 'The provider requires credits. Check the account balance and spending limit.';
  else if (status === 429) explanation = 'The provider rate or quota limit was reached.';
  else if (status >= 500) explanation = 'The provider service is unavailable.';
  else if ((status === 400 || status === 404 || status === 422) && reason !== 'context_limit')
    explanation = 'Check the provider model, endpoint and supported request format.';
  const fields = [reason, status && `HTTP ${status}`];
  if (['request_timeout', 'turn_timeout'].includes(reason) && Number.isInteger(timeoutMs))
    fields.push(`${timeoutMs}ms`);
  const decision = kind === 'decision';
  const action = !decision
    ? 'Retrying with backoff while listening.'
    : recovery.budgetExhausted
      ? 'Decision request limit reached · using basic world behavior for this run.'
      : Number.isFinite(recovery.retryMs)
        ? `Using basic world behavior; retrying with fresh state after ${recovery.retryMs / 1000}s.`
        : recovery.skip
          ? 'Skipping this evaluation; fresh input can use decisions again.'
          : 'Using basic world behavior for this run; restart after correcting the issue.';
  return `${now.toISOString()} ${decision ? 'Decision model' : 'Conversation provider'} unavailable [${fields.filter(Boolean).join(' · ')}] · ${explanation} ${action}`;
}

/** Retry-After seconds or HTTP date, without retaining the untrusted header. */
export function retryAfterMilliseconds(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > 128) return 0;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : 0;
  }
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)) return 0;
  const until = Date.parse(trimmed);
  return Number.isFinite(until) ? Math.max(0, until - now) : 0;
}

/** Bounded, redirect-free provider I/O. Never include a response body in an error. */
export async function readProviderJSON(response, limit = 2_000_000) {
  if (!response.ok) {
    let reason = 'provider_http_error';
    if (response.status === 400 || response.status === 413 || response.status === 422) {
      try {
        const payload = await readJSONBody(response, Math.min(limit, 8192));
        if (isContextLimit(payload)) reason = 'context_limit';
      } catch {
        // Invalid/large error bodies still preserve the HTTP failure and status.
      }
    } else await response.body?.cancel().catch(() => {});
    throw Object.assign(providerFailure(reason, response.status), {
      retryAfterMs: retryAfterMilliseconds(response.headers.get('retry-after')),
    });
  }
  return readJSONBody(response, limit);
}

function isContextLimit(payload) {
  if (payload?.error?.code === 'context_length_exceeded') return true;
  if (payload?.detail?.error_type === 'max_tokens_exceeded') return true;
  // OpenRouter wraps the TypeSafe detail object in a fixed HTTP prefix. Parse
  // only that envelope; never surface arbitrary message text or substring matches.
  const message = payload?.error?.message;
  if (typeof message !== 'string' || !message.startsWith('HTTP 400: {')) return false;
  try {
    return (
      JSON.parse(message.slice('HTTP 400: '.length))?.detail?.error_type === 'max_tokens_exceeded'
    );
  } catch {
    return false;
  }
}

async function readJSONBody(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw providerFailure('unreadable_response');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw providerFailure('response_too_large');
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw providerFailure('invalid_json');
    }
  } catch (error) {
    throw error?.code === 'provider_unavailable'
      ? providerFailure(error.reason, error.status)
      : providerFailure('unreadable_response');
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function providerJSON(
  url,
  { fetchImpl = fetch, signal, timeout = 10000, ...options } = {},
) {
  const bounded = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: bounded,
      redirect: 'error',
      credentials: 'omit',
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw providerFailure(bounded.aborted ? 'request_timeout' : networkFailureReason(error));
  }
  return readProviderJSON(response);
}
