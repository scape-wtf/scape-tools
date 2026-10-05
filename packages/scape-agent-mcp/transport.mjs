/** Dependency-free HTTP client. Model choice and wallet credentials stay with the owner. */
export class ScapeAgent {
  #origin;
  #token;
  #request;
  #onToken;
  #session;
  #timer;
  #inFlight = false;
  #generation = 0;
  constructor({ origin, token, request = fetch, onToken }) {
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      throw new Error('Use an HTTPS Scape origin or loopback HTTP.');
    this.#origin = url.origin;
    this.#token = token;
    this.#request = request;
    this.#onToken = onToken;
  }
  async #call(action, body = {}, authenticated = true) {
    const response = await this.#request(`${this.#origin}/api/agents/${action}`, {
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated && this.#token ? { Authorization: `Bearer ${this.#token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'Agent request failed');
      error.code = result.code;
      error.status = response.status;
      throw error;
    }
    return result;
  }
  async pair(name) {
    if (this.#session) throw new Error('Leave before pairing again.');
    const result = await this.#call('link/start', { name }, false);
    this.#token = result.secret;
    await this.#onToken?.(result.secret);
    return { code: result.code, expiresAt: result.expiresAt };
  }
  pairingStatus() {
    return this.#call('link/poll');
  }
  async enter() {
    const observation = await this.#call('enter');
    this.#session = observation.sessionId;
    return observation;
  }
  observe() {
    return this.#call('observe', { sessionId: this.#session });
  }
  speak(text, id = crypto.randomUUID()) {
    return this.#call('speak', { sessionId: this.#session, id, text });
  }
  moveTo(x, y, floor = 0, id = crypto.randomUUID()) {
    return this.#call('move-to', { sessionId: this.#session, id, x, y, floor });
  }
  action(action, body = {}, id = crypto.randomUUID()) {
    return this.#call(action, { ...body, sessionId: this.#session, id });
  }
  avatar(body) {
    return this.#call('avatar', body);
  }
  stop(id = crypto.randomUUID()) {
    return this.#call('stop', { sessionId: this.#session, id });
  }
  /** Polling keeps the lease alive. An error ends polling and lets the server expire presence. */
  watch(onObservation, onError = () => {}, intervalMs = 2000) {
    this.unwatch();
    const generation = this.#generation;
    const tick = async () => {
      if (generation !== this.#generation) return;
      if (this.#inFlight) {
        this.#timer = setTimeout(tick, intervalMs);
        return;
      }
      this.#inFlight = true;
      try {
        const observation = await this.observe();
        if (generation === this.#generation) onObservation(observation);
      } catch (error) {
        if (generation === this.#generation) {
          this.unwatch();
          onError(error);
        }
      } finally {
        this.#inFlight = false;
        if (generation === this.#generation) this.#timer = setTimeout(tick, intervalMs);
      }
    };
    void tick();
    return () => {
      if (generation === this.#generation) this.unwatch();
    };
  }
  unwatch() {
    this.#generation++;
    clearTimeout(this.#timer);
  }
  async leave() {
    this.unwatch();
    const sessionId = this.#session;
    try {
      return await this.#call('leave', { sessionId });
    } finally {
      if (this.#session === sessionId) this.#session = undefined;
    }
  }
}
