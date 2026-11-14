/**
 * The studio's timers and animation frames, all cancelled together when the studio closes.
 *
 * Activities get the same guarantee from `kit.scope`. The studio is not an activity and runs
 * outside the activity shell, so it owns this small scope instead. This file is the only place in
 * the paint studio that touches the global timer functions, which the lint rule bans elsewhere
 * under src/features/. Everything else asks the scope.
 */
export interface StudioScope {
  setTimeout(callback: () => void, ms: number): () => void;
  setInterval(callback: () => void, ms: number): () => void;
  requestFrame(callback: (time: number) => void): () => void;
  /** Cancels everything. Later calls do nothing and return a no-op cancel. */
  dispose(): void;
  readonly disposed: boolean;
  /** How many callbacks are still waiting. A fired or cancelled one is forgotten, so this never grows by itself. */
  readonly pending: number;
}

/** The platform timers the scope wraps. Each call returns a function that cancels it. Tests pass fakes. */
export interface TimerHost {
  setTimeout(callback: () => void, ms: number): () => void;
  setInterval(callback: () => void, ms: number): () => void;
  requestAnimationFrame(callback: (time: number) => void): () => void;
}

const noop = (): void => undefined;

export function createStudioScope(host: TimerHost = browserTimers()): StudioScope {
  const cancels = new Set<() => void>();
  let disposed = false;

  /** Tracks one pending callback. The returned cancel works once and forgets the callback. */
  function track(start: (done: () => void) => () => void): () => void {
    if (disposed) return noop;
    let stop = noop;
    const cancel = (): void => {
      if (!cancels.delete(cancel)) return;
      stop();
    };
    cancels.add(cancel);
    stop = start(() => cancels.delete(cancel));
    return cancel;
  }

  return {
    get disposed() {
      return disposed;
    },
    get pending() {
      return cancels.size;
    },
    setTimeout: (callback, ms) =>
      track((done) =>
        host.setTimeout(() => {
          done();
          callback();
        }, ms),
      ),
    setInterval: (callback, ms) => track(() => host.setInterval(callback, ms)),
    requestFrame: (callback) =>
      track((done) =>
        host.requestAnimationFrame((time) => {
          done();
          callback(time);
        }),
      ),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cancel of cancels) cancel();
      cancels.clear();
    },
  };
}

function browserTimers(): TimerHost {
  /* oxlint-disable no-restricted-globals -- The studio's scope is the one owner of global timers; see the file comment. */
  return {
    setTimeout(callback, ms) {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
    setInterval(callback, ms) {
      const id = setInterval(callback, ms);
      return () => clearInterval(id);
    },
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(id);
    },
  };
  /* oxlint-enable no-restricted-globals */
}
