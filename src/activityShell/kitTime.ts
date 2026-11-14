import {
  createManualScheduler,
  systemScheduler,
  type ManualScheduler,
  type Scheduler,
} from '../core/activityKit/scheduler.ts';

/**
 * The one scheduler every activity scope uses. It runs on the page's real timers until an
 * end-to-end test pins it. From then on, timers, frames, and the kit clock move only when the
 * test steps them through `window.wkcKitTime`. Timers set before the pin keep their real timing.
 */
export interface SwitchableScheduler extends Scheduler {
  /** Switches to a manual scheduler that starts at `wall`. Pinning again starts a fresh one. */
  pin(wall: number): ManualScheduler;
  /** The manual scheduler after a pin, or null while time is real. */
  readonly manual: ManualScheduler | null;
}

export function createSwitchableScheduler(base: Scheduler): SwitchableScheduler {
  let manual: ManualScheduler | null = null;
  const current = (): Scheduler => manual ?? base;
  return {
    now: () => current().now(),
    monotonic: () => current().monotonic(),
    setTimeout: (callback, ms) => current().setTimeout(callback, ms),
    setInterval: (callback, ms) => current().setInterval(callback, ms),
    requestFrame: (callback) => current().requestFrame(callback),
    pin(wall) {
      manual = createManualScheduler({ wall, monotonic: base.monotonic() });
      return manual;
    },
    get manual() {
      return manual;
    },
  };
}

export const kitScheduler: SwitchableScheduler = createSwitchableScheduler(systemScheduler());

/** The global end-to-end tests use. e2e/support/kitTime.ts reads it the same way. */
export const KIT_TIME_GLOBAL = 'wkcKitTime';

/** What a test can do with kit time. Every method returns the monotonic time after it ran. */
export interface KitTimeHook {
  pin(wall: number): number;
  advance(ms: number): number;
  stepFrames(count: number): number;
}

/** Puts the kit time hook on the window. Call it only in a test run. */
export function exposeKitTime(scheduler: SwitchableScheduler = kitScheduler, target: object = globalThis): void {
  const requireManual = (): ManualScheduler => {
    const manual = scheduler.manual;
    if (manual === null) throw new Error('Pin kit time first: wkcKitTime.pin(wall).');
    return manual;
  };
  const hook: KitTimeHook = {
    pin: (wall) => scheduler.pin(wall).monotonic(),
    advance(ms) {
      const manual = requireManual();
      manual.advance(ms);
      return manual.monotonic();
    },
    stepFrames(count) {
      const manual = requireManual();
      manual.stepFrames(count);
      return manual.monotonic();
    },
  };
  Object.defineProperty(target, KIT_TIME_GLOBAL, { configurable: true, value: hook });
}
