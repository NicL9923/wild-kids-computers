import type { SessionClock } from './session/sessionLength.ts';

/** A clock that runs in real time and that an end-to-end test can step forward. */
export interface SteppableClock extends SessionClock {
  /** Moves wall and monotonic time forward. */
  advance(ms: number): void;
}

declare global {
  interface Window {
    /** Present only in a test run. e2e/support/clock.ts steps it. */
    wkcTestClock?: Pick<SteppableClock, 'advance'>;
  }
}

/**
 * Real time plus an offset the test controls, so the session length can run out without waiting
 * minutes. main.tsx passes it to the session store only when the app runs under test.
 */
export function createSteppableClock(base: SessionClock): SteppableClock {
  let offset = 0;
  return {
    now: () => base.now() + offset,
    monotonic: () => base.monotonic() + offset,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError('The test clock only moves forward.');
      offset += ms;
    },
  };
}

/** Puts the clock where end-to-end tests reach it. Call only in a test run. */
export function exposeTestClock(clock: SteppableClock): void {
  window.wkcTestClock = { advance: (ms) => clock.advance(ms) };
}
