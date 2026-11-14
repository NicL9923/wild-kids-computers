import type { Cancel, Scheduler } from './scheduler.ts';

/** Anything with add and remove listener methods: an element, the window, the document. */
export type ListenerTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

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
  /**
   * How many timers, frames, listeners, and cleanups it still owns. A timeout or frame that ran
   * no longer counts, so a long round does not pile up dead entries.
   */
  pending(): number;
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
      // The caller typed its listener for the event it expects; the target hands it that event.
      const handler = (event: Event) => {
        Reflect.apply(listener, undefined, [event]);
      };
      target.addEventListener(type, handler, options);
      return track(() => target.removeEventListener(type, handler, options));
    },
    own(cleanup) {
      if (disposed) {
        cleanup();
        return NOTHING;
      }
      return track(cleanup);
    },
    pending: () => cleanups.size,
    dispose() {
      disposed = true;
      const errors: unknown[] = [];
      // Each cleanup removes itself from the set as it runs, which a Set allows during iteration,
      // so the set is empty afterwards and a second dispose does nothing.
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      // Every cleanup ran. Report the first failure so a broken one is not silent.
      if (errors.length > 0) throw errors[0];
    },
  };
  return scope;
}
