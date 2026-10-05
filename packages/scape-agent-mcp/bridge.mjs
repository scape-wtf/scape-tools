/** A local lifecycle adapter. Models see public observations, never the client's bearer. */
export class AgentBridge {
  #client;
  #pair;
  #active = false;
  #hasSession = false;
  #closed = false;
  #latest;
  #unwatch;
  #timer;
  #lastTool = 0;
  #idleMs;
  #tail = Promise.resolve();
  #queued = 0;
  #epoch = 0;
  #waiters = new Set();
  #reason = 'Call scape_pair, approve its code in Scape, then call scape_enter.';
  constructor(client, { idleMs = 120_000 } = {}) {
    this.#client = client;
    this.#idleMs = idleMs;
  }
  #queue(work, { priority = false, signal } = {}) {
    if (this.#closed) return Promise.reject(new Error('The Scape connection is closing.'));
    if (!priority && this.#queued >= 4)
      return Promise.reject(
        new Error('Too many pending game actions. Wait for the current action.'),
      );
    const epoch = this.#epoch;
    this.#queued++;
    const result = this.#tail.then(async () => {
      if (this.#closed || epoch !== this.#epoch || signal?.aborted)
        throw new Error('This action was cancelled before dispatch.');
      return work(epoch);
    });
    this.#tail = result
      .catch(() => {})
      .finally(() => {
        this.#queued--;
      });
    return result;
  }
  #assertActive() {
    if (this.#closed || !this.#active || !this.#latest) throw new Error(this.#reason);
    this.#lastTool = Date.now();
    return this.#latest;
  }
  #detach(reason) {
    this.#reason = reason;
    this.#active = false;
    this.#latest = undefined;
    this.#unwatch?.();
    this.#unwatch = undefined;
    clearInterval(this.#timer);
    for (const wake of [...this.#waiters]) wake();
  }
  pair(name, signal) {
    return this.#queue(
      async () => {
        if (this.#active) throw new Error('Call scape_leave before requesting another pairing.');
        if (this.#pair?.name === name && this.#pair.expiresAt > Date.now()) return this.#pair;
        const pair = await this.#client.pair(name);
        this.#pair = {
          name,
          ...pair,
          instructions:
            'In Scape, open Settings → Developer → Agents, review this code and choose a world. Only the owner can approve it. Then call scape_enter.',
        };
        return this.#pair;
      },
      { signal },
    );
  }
  enter(signal) {
    return this.#queue(
      async epoch => {
        if (this.#active)
          return {
            entered: true,
            observation: this.#assertActive(),
            inactivityTimeoutMs: this.#idleMs,
          };
        const status = await this.#client.pairingStatus();
        if (!status.approved)
          return {
            entered: false,
            status: 'awaiting_owner_approval',
            code: this.#pair?.code,
            expiresAt: status.expiresAt,
          };
        this.#pair = undefined;
        if (this.#closed || epoch !== this.#epoch || signal?.aborted)
          throw new Error('Entry was cancelled.');
        const observation = await this.#client.enter();
        this.#hasSession = true;
        if (this.#closed || epoch !== this.#epoch || signal?.aborted) {
          await this.#client.leave();
          this.#hasSession = false;
          throw new Error('Entry was cancelled.');
        }
        this.#latest = observation;
        this.#active = true;
        this.#lastTool = Date.now();
        const session = observation.sessionId;
        this.#unwatch = this.#client.watch(
          next => {
            if (!this.#active || this.#latest?.sessionId !== session) return;
            if (next.sessionId !== session) {
              void this.leave('The game session changed. Call scape_enter again.').catch(() => {});
              return;
            }
            this.#latest = next;
            for (const wake of [...this.#waiters]) wake();
          },
          () => {
            if (this.#active && this.#latest?.sessionId === session)
              void this.leave(
                'The game connection ended. Call scape_enter, or pair again if access was revoked.',
              ).catch(() => {});
          },
          250,
        );
        this.#timer = setInterval(() => {
          if (this.#active && Date.now() - this.#lastTool >= this.#idleMs)
            void this.leave(
              'Left after two minutes without a game tool call. Call scape_enter to return.',
            ).catch(() => {});
        }, 1000);
        this.#timer.unref();
        return { entered: true, observation, inactivityTimeoutMs: this.#idleMs };
      },
      { signal },
    );
  }
  observe({ afterRevision, waitMs = 0 } = {}, signal) {
    const initial = this.#assertActive();
    if (signal?.aborted) return Promise.reject(new Error('Observation wait cancelled.'));
    if (afterRevision === undefined || initial.revision !== afterRevision || waitMs === 0)
      return Promise.resolve(initial);
    return new Promise((resolve, reject) => {
      let timeout;
      const finish = error => {
        clearTimeout(timeout);
        this.#waiters.delete(wake);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(this.#latest);
      };
      const wake = () => {
        if (!this.#active) finish(new Error(this.#reason));
        else if (this.#latest.revision !== afterRevision) finish();
      };
      const abort = () => finish(new Error('Observation wait cancelled.'));
      this.#waiters.add(wake);
      signal?.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => finish(), Math.min(25_000, Math.max(0, waitMs)));
    });
  }
  speak(text, id, signal) {
    return this.#queue(
      async () => {
        this.#assertActive();
        return { ...(await this.#client.speak(text, id)), commandId: id };
      },
      { signal },
    );
  }
  moveTo(x, y, floor, id, signal) {
    return this.#queue(
      async () => {
        this.#assertActive();
        return { ...(await this.#client.moveTo(x, y, floor, id)), commandId: id };
      },
      { signal },
    );
  }
  action(action, args, id, signal) {
    return this.#queue(
      async () => {
        this.#assertActive();
        return { ...(await this.#client.action(action, args, id)), commandId: id };
      },
      { signal },
    );
  }
  avatar(args, signal) {
    return this.#queue(
      async () => {
        const status = await this.#client.pairingStatus();
        if (!status.approved) throw new Error('Approve pairing before setting an avatar.');
        return this.#client.avatar(args);
      },
      { signal },
    );
  }
  reference(action, args, signal) {
    return this.#queue(
      () => {
        if (this.#active) this.#assertActive();
        return this.#client.action(action, args);
      },
      { signal },
    );
  }
  worldStatus(signal) {
    return this.#queue(() => this.#client.action('world-status'), { signal });
  }
  stop(id, signal) {
    // Drop queued intent; one request already in flight finishes before stop is sent.
    this.#epoch++;
    return this.#queue(
      async () => {
        this.#assertActive();
        return { ...(await this.#client.stop(id)), commandId: id };
      },
      { priority: true, signal },
    );
  }
  leave(reason = 'Left the world. Call scape_enter to return.', signal) {
    this.#epoch++;
    this.#detach(reason);
    return this.#queue(
      async () => {
        if (this.#hasSession) {
          await this.#client.leave();
          this.#hasSession = false;
        }
        return { ok: true };
      },
      { priority: true, signal },
    );
  }
  async close() {
    if (this.#closed) return this.#tail;
    this.#closed = true;
    this.#epoch++;
    this.#detach('The MCP connection closed.');
    await this.#tail;
    if (this.#hasSession) {
      await this.#client.leave();
      this.#hasSession = false;
    }
  }
}
