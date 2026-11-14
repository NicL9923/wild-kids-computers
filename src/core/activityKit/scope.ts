import type { Cancel, Scheduler } from './scheduler.ts';

/** Anything with add and remove listener methods: an element, the window, the document. */
export interface ListenerTarget {
  addEventListener(type: string, listener: (event: never) => void, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: (event: never) => void, options?: EventListenerOptions | boolean): void;
}

/**
 * Owns every timer, frame, listener, and sound an activity starts. Leaving the activity disposes
 * the scope, which cancels all of them. After that every call is a safe no-op, so a callback that
 * runs late cannot start anything new.
 */
export interface Scope {
  setTimeout(callback: () => void, ms: number): Cancel;
  setInterval(callback: () => void, ms: number): Cancel;
  requestFrame(callback: (time: number) => void): Cancel;
  /** `listener` may take any event type, such as `(event: KeyboardEvent) => ...`. */
  listen(
    target: ListenerTarget,
    type: string,
    listener: (event: never) => void,
    options?: AddEventListenerOptions,
  ): Cancel;
  /**
   * Registers cleanup to run on dispose, such as stopping a sound. Returns a function that runs
   * it early. On a disposed scope the cleanup runs at once.
   */
  own(cleanup: () => void): Cancel;
  readonly disposed: boolean;
}

export interface OwnedScope extends Scope {
  /** Cancels everything. Safe to call more than once. */
  dispose(): void;
}

const NOTHING: Cancel = () => undefined;

export function createScope(scheduler: Scheduler): OwnedScope {
  const cleanups = new Set<() => void>();
  let disposed = false;

  /** Tracks a cancel function until it runs once. */
  const track = (cancel: Cancel): (() => void) => {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      cleanups.delete(once);
      cancel();
    };
    cleanups.add(once);
    return once;
  };

  const scope: OwnedScope = {
    get disposed() {
      return disposed;
    },
    setTimeout(callback, ms) {
      if (disposed) return NOTHING;
      let finish: Cancel = NOTHING;
      const cancel = scheduler.setTimeout(() => {
        // A timeout that ran needs no cancelling.
        cleanups.delete(finish);
        callback();
      }, ms);
      finish = track(cancel);
      return finish;
    },
    setInterval(callback, ms) {
      if (disposed) return NOTHING;
      return track(scheduler.setInterval(callback, ms));
    },
    requestFrame(callback) {
      if (disposed) return NOTHING;
      let finish: Cancel = NOTHING;
      const cancel = scheduler.requestFrame((time) => {
        cleanups.delete(finish);
        callback(time);
      });
      finish = track(cancel);
      return finish;
    },
    listen(target, type, listener, options) {
      if (disposed) return NOTHING;
      target.addEventListener(type, listener, options);
      return track(() => target.removeEventListener(type, listener, options));
    },
    own(cleanup) {
      if (disposed) {
        cleanup();
        return NOTHING;
      }
      return track(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      // A cleanup removes itself from the set as it runs, which a Set allows during iteration.
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      cleanups.clear();
      // Every cleanup ran. Report the first failure so a broken one is not silent.
      if (errors.length > 0) throw errors[0];
    },
  };
  return scope;
}
