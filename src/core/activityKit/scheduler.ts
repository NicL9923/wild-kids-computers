/**
 * Time for activities: the clock and the timers a scope schedules. The app uses the system
 * scheduler. A test pins time with a manual scheduler and steps it, so animation frames and
 * timeouts run exactly when the test says.
 */

/** Cancels what was scheduled. Safe to call more than once, and after it already ran. */
export type Cancel = () => void;

/** Wall time and monotonic time. Activities read time only from here. */
export interface KitClock {
  /** Milliseconds since the epoch. Use it for dates, never for measuring how long something took. */
  now(): number;
  /** Milliseconds from an arbitrary start that never jumps back. Use it for durations. */
  monotonic(): number;
}

export interface Scheduler extends KitClock {
  setTimeout(callback: () => void, ms: number): Cancel;
  setInterval(callback: () => void, ms: number): Cancel;
  /** Runs once on the next animation frame with the monotonic time of the frame. */
  requestFrame(callback: (time: number) => void): Cancel;
}

/** One frame at 60 frames a second, the step of the manual scheduler's frames. */
export const FRAME_MS = 1000 / 60;

function assertDelay(name: string, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`${name} needs a delay of 0 ms or more, not ${String(ms)}.`);
}

/** The real timers and clock of the page. It reads the globals when called, never at import. */
export function systemScheduler(): Scheduler {
  return {
    now: () => Date.now(),
    monotonic: () => performance.now(),
    setTimeout(callback, ms) {
      assertDelay('setTimeout', ms);
      const id = globalThis.setTimeout(callback, ms);
      return () => globalThis.clearTimeout(id);
    },
    setInterval(callback, ms) {
      assertDelay('setInterval', ms);
      const id = globalThis.setInterval(callback, Math.max(1, ms));
      return () => globalThis.clearInterval(id);
    },
    requestFrame(callback) {
      const id = globalThis.requestAnimationFrame(callback);
      return () => globalThis.cancelAnimationFrame(id);
    },
  };
}

export interface ManualScheduler extends Scheduler {
  /** Moves time forward, running every timer and frame that falls due, in time order. */
  advance(ms: number): void;
  /** Moves time forward by whole frames. */
  stepFrames(count: number): void;
  /** How many timeouts, intervals, and frame callbacks are waiting. */
  pending(): number;
}

interface Timer {
  readonly id: number;
  due: number;
  readonly every: number | null;
  readonly callback: () => void;
}

/**
 * A scheduler whose time moves only when `advance` or `stepFrames` is called. Frames fall on
 * multiples of FRAME_MS from the start. A frame callback requested during a frame runs on the
 * next one, as in a browser.
 */
export function createManualScheduler(start: { wall: number; monotonic?: number }): ManualScheduler {
  const origin = start.monotonic ?? 0;
  let elapsed = 0;
  let nextId = 1;
  let framesRun = 0;
  const timers: Timer[] = [];
  let frames = new Map<number, (time: number) => void>();

  const add = (callback: () => void, ms: number, every: number | null): Cancel => {
    const timer: Timer = { id: nextId, due: elapsed + ms, every, callback };
    nextId += 1;
    timers.push(timer);
    return () => {
      const index = timers.indexOf(timer);
      if (index !== -1) timers.splice(index, 1);
    };
  };

  /** The timer that is due first, oldest first among equals. */
  const earliest = (): Timer | undefined =>
    timers.reduce<Timer | undefined>((best, timer) => {
      if (best === undefined) return timer;
      return timer.due < best.due || (timer.due === best.due && timer.id < best.id) ? timer : best;
    }, undefined);

  const runFrame = (): void => {
    const due = frames;
    frames = new Map();
    for (const callback of due.values()) callback(origin + elapsed);
  };

  const scheduler: ManualScheduler = {
    now: () => start.wall + elapsed,
    monotonic: () => origin + elapsed,
    setTimeout(callback, ms) {
      assertDelay('setTimeout', ms);
      return add(callback, ms, null);
    },
    setInterval(callback, ms) {
      assertDelay('setInterval', ms);
      const every = Math.max(1, ms);
      return add(callback, every, every);
    },
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return () => {
        frames.delete(id);
      };
    },
    advance(ms) {
      assertDelay('advance', ms);
      runUntil(elapsed + ms);
    },
    stepFrames(count) {
      if (!Number.isInteger(count) || count < 0) {
        throw new RangeError(`stepFrames needs a whole number of frames, not ${String(count)}.`);
      }
      runUntil((framesRun + count) * FRAME_MS);
    },
    pending: () => timers.length + frames.size,
  };

  function runUntil(target: number): void {
    for (;;) {
      const timer = earliest();
      const nextFrame = (framesRun + 1) * FRAME_MS;
      const timerDue = timer === undefined ? Number.POSITIVE_INFINITY : timer.due;
      if (Math.min(timerDue, nextFrame) > target) break;
      if (timer !== undefined && timerDue <= nextFrame) {
        elapsed = timer.due;
        if (timer.every === null) timers.splice(timers.indexOf(timer), 1);
        else timer.due += timer.every;
        timer.callback();
      } else {
        elapsed = nextFrame;
        framesRun += 1;
        runFrame();
      }
    }
    elapsed = Math.max(elapsed, target);
  }
  return scheduler;
}
