import { setTimeout as delay } from 'node:timers/promises';

const operations = new Set([
  'link/start',
  'link/poll',
  'enter',
  'observe',
  'speak',
  'move-to',
  'avatar',
  'stop',
  'leave',
  'step',
  'interact',
  'expression',
  'follow',
  'approach',
  'guide',
  'avatar-catalog',
  'world-status',
]);
const reasons = {
  request_timeout: 'Scape request timed out after 10s.',
  connection_reset: 'The network connection was reset.',
  connection_refused: 'The Scape endpoint refused the connection.',
  dns_failure: 'The Scape hostname could not be resolved.',
  network_unreachable: 'The network could not reach Scape.',
  socket_closed: 'The network socket closed before the request completed.',
  tls_failure: 'The secure connection could not be verified.',
  network_error: 'The Scape request failed before a response was received.',
  unreadable_response: 'Scape returned an unreadable response.',
  world_reconnecting: 'The backend connection to the world is reconnecting.',
  world_offline: 'The backend connection to the world is offline.',
  world_removed: 'The world reported that this presence was removed.',
  world_replaced: 'The world reported that this presence was replaced.',
  world_stopped: 'The backend connection to the world stopped.',
};
const codes = {
  connection_lost: 'The connection to Scape was interrupted.',
  session_ended: 'The server-side presence session ended.',
  not_connected: 'The agent is not connected to the world.',
  unavailable: 'Scape service is temporarily unavailable.',
  rate_limited: 'Scape is temporarily limiting requests.',
  capacity: 'The agent service is at capacity.',
};

/** Only fixed diagnostic identifiers may cross the transport/MCP/log boundaries. */
export function connectionDetails(error) {
  return {
    ...(operations.has(error?.operation) ? { operation: error.operation } : {}),
    ...(Object.hasOwn(reasons, error?.reason) ? { reason: error.reason } : {}),
  };
}

export function networkFailureReason(error) {
  if (error?.name === 'TimeoutError') return 'request_timeout';
  const code = error?.cause?.code ?? error?.code;
  const networkReasons = {
    ECONNRESET: 'connection_reset',
    ECONNREFUSED: 'connection_refused',
    ENOTFOUND: 'dns_failure',
    EAI_AGAIN: 'dns_failure',
    ENETUNREACH: 'network_unreachable',
    EHOSTUNREACH: 'network_unreachable',
    ETIMEDOUT: 'network_unreachable',
    UND_ERR_CONNECT_TIMEOUT: 'network_unreachable',
    UND_ERR_SOCKET: 'socket_closed',
    CERT_HAS_EXPIRED: 'tls_failure',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'tls_failure',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'tls_failure',
    ERR_TLS_CERT_ALTNAME_INVALID: 'tls_failure',
  };
  return Object.hasOwn(networkReasons, code) ? networkReasons[code] : 'network_error';
}

export function connectionRetryMessage(error, milliseconds, now = new Date()) {
  const details = connectionDetails(error);
  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : undefined;
  const code = Object.hasOwn(codes, error?.code)
    ? error.code
    : status
      ? 'http_error'
      : 'connection_lost';
  const fields = [code, details.operation, status && `HTTP ${status}`, details.reason].filter(
    Boolean,
  );
  const description =
    reasons[details.reason] ??
    codes[code] ??
    (status === 429
      ? 'Scape is temporarily limiting requests.'
      : status === 408
        ? 'The server timed out the request.'
        : status >= 500
          ? 'Scape service is temporarily unavailable.'
          : 'The Scape request failed.');
  return `${now.toISOString()} Scape connection interrupted [${fields.join(' · ')}] · ${description} Retrying in ${milliseconds / 1000}s.`;
}

/** Access decisions always win over transient transport/session failures. */
export function connectionFailure(error) {
  if ([401, 403].includes(error?.status)) return false;
  if (
    ['unauthorized', 'access_revoked', 'permission_denied', 'removed', 'stale_session'].includes(
      error?.code,
    )
  )
    return false;
  return (
    ['connection_lost', 'session_ended', 'not_connected'].includes(error?.code) ||
    [408, 429].includes(error?.status) ||
    (error?.status >= 500 && error.status <= 599)
  );
}

export const recoveryDelay = attempt => Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));

/** Re-enter only after a failed connection, never after voluntary stop or denied access. */
export async function recoverConnection({
  connect,
  run,
  signal,
  onRetry = () => {},
  wait = delay,
}) {
  let attempt = 0;
  while (!signal.aborted) {
    let connectedAt;
    try {
      const observation = await connect();
      signal.throwIfAborted();
      connectedAt = Date.now();
      await run(observation);
      return;
    } catch (error) {
      signal.throwIfAborted();
      if (!connectionFailure(error)) throw error;
      // Rapid connect/disconnect cycles must back off too.
      if (connectedAt && Date.now() - connectedAt >= 30000) attempt = 0;
      const milliseconds = recoveryDelay(attempt++);
      onRetry(milliseconds, error);
      await wait(milliseconds, undefined, { signal });
    }
  }
}
