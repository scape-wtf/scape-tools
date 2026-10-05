/** Bounded, redirect-free provider I/O. Never include a response body in an error. */
export async function readProviderJSON(response, limit = 2_000_000) {
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(
      `Provider returned HTTP ${response.status}. Check access, model availability and usage limits.`,
    );
    error.status = response.status;
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Provider returned an empty response.');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error('Provider response exceeded the size limit.');
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('Provider returned invalid JSON.');
    }
  } finally {
    await reader.cancel();
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
  } catch {
    signal?.throwIfAborted();
    throw new Error('Cannot reach the provider. Check the server address and connection.');
  }
  return readProviderJSON(response);
}
