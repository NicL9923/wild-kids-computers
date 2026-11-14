import { describe, expect, it } from 'vitest';
import type { CloseRequest } from '../../src/core/platform/bridge.ts';
import { createWindowControl, type LockableWindow } from './windowControl.ts';

/** A window that records what happens to it. A close goes through its close listeners first. */
function fakeWindow() {
  let closeListener: ((event: { preventDefault(): void }) => void) | undefined;
  const state = { fullscreen: false, kiosk: false, closed: false, destroyed: false };
  const window: LockableWindow = {
    on: (_event, listener) => {
      closeListener = listener;
    },
    close: () => {
      let prevented = false;
      closeListener?.({ preventDefault: () => void (prevented = true) });
      if (!prevented) state.closed = true;
    },
    destroy: () => {
      state.closed = true;
      state.destroyed = true;
    },
    isDestroyed: () => state.closed,
    isFullScreen: () => state.fullscreen,
    isKiosk: () => state.kiosk,
    setFullScreen: (on) => void (state.fullscreen = on),
    setKiosk: (on) => void (state.kiosk = on),
  };
  return { window, state };
}

/** Timers that run only when the test says time has passed. */
function manualTimers() {
  let next = 1;
  const pending = new Map<number, { run: () => void; at: number }>();
  let now = 0;
  return {
    setTimeout: (run: () => void, ms: number) => {
      const id = next++;
      pending.set(id, { run, at: now + ms });
      return id;
    },
    clearTimeout: (id: number) => void pending.delete(id),
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of pending) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.run();
        }
      }
    },
    pendingCount: () => pending.size,
  };
}

function setup() {
  const { window, state } = fakeWindow();
  const timers = manualTimers();
  const notices: string[] = [];
  const control = createWindowControl(window, {
    notifyCloseRequest: (request: CloseRequest) => notices.push(request.kioskLock ? 'kiosk close' : 'close'),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    ackTimeoutMs: 3_000,
  });
  return { window, state, timers, notices, control };
}

describe('window control', () => {
  // Without kiosk lock the renderer still gets the close, so it can save unsaved work first.
  it('holds a close without kiosk lock too, and closes once the renderer confirms', () => {
    const { window, state, timers, notices, control } = setup();
    window.close();
    expect(state.closed).toBe(false);
    expect(notices).toEqual(['close']);
    control.acknowledgeCloseRequest();
    timers.advance(60_000);
    expect(state.closed).toBe(false);
    control.allowClose();
    expect(state).toMatchObject({ closed: true, destroyed: false });
  });

  it('destroys an unlocked window whose renderer does not answer in time', () => {
    const { window, state, timers } = setup();
    window.close();
    timers.advance(2_999);
    expect(state.closed).toBe(false);
    timers.advance(1);
    expect(state).toMatchObject({ closed: true, destroyed: true });
  });

  it('holds a close while locked, tells the renderer, and closes after the answer timeout', () => {
    const { window, state, timers, notices, control } = setup();
    control.setKioskLock(true);
    window.close();
    expect(state.closed).toBe(false);
    expect(notices).toEqual(['kiosk close']);
    timers.advance(2_999);
    expect(state.closed).toBe(false);
    timers.advance(1);
    // Destroyed, not closed, because a hung page never finishes its unload handlers.
    expect(state).toMatchObject({ closed: true, destroyed: true });
  });

  it('keeps the app open once the renderer answers, until it confirms the quit', () => {
    const { window, state, timers, control } = setup();
    control.setKioskLock(true);
    window.close();
    control.acknowledgeCloseRequest();
    timers.advance(60_000);
    expect(state.closed).toBe(false);
    control.allowClose();
    expect(state).toMatchObject({ closed: true, destroyed: false });
  });

  it('force-closes a locked window at once, for a crashed renderer or a system shutdown', () => {
    const { state, timers, control } = setup();
    control.setKioskLock(true);
    control.forceClose();
    expect(state).toMatchObject({ closed: true, destroyed: true });
    expect(timers.pendingCount()).toBe(0);
  });

  it('needs a fresh answer for every close attempt, so a renderer that hangs later still closes', () => {
    const { window, state, timers, notices, control } = setup();
    control.setKioskLock(true);
    window.close();
    control.acknowledgeCloseRequest();
    window.close();
    expect(notices).toHaveLength(2);
    timers.advance(3_000);
    expect(state.closed).toBe(true);
  });

  it('runs one timer for repeated attempts', () => {
    const { window, timers, control } = setup();
    control.setKioskLock(true);
    window.close();
    window.close();
    expect(timers.pendingCount()).toBe(1);
  });

  it('drops a pending close when the lock turns off', () => {
    const { window, state, timers, notices, control } = setup();
    control.setKioskLock(true);
    window.close();
    control.setKioskLock(false);
    timers.advance(3_000);
    expect(state.closed).toBe(false);
    // The next attempt asks the renderer again, now without the parent gate.
    window.close();
    expect(notices).toEqual(['kiosk close', 'close']);
  });

  it('reports kiosk lock as fullscreen and keeps it fullscreen until unlocked', () => {
    const { state, control } = setup();
    expect(control.setKioskLock(true)).toEqual({ fullscreen: true, kioskLock: true });
    expect(control.setFullscreen(false)).toEqual({ fullscreen: true, kioskLock: true });
    expect(state.fullscreen).toBe(false);
    expect(control.setKioskLock(false)).toEqual({ fullscreen: false, kioskLock: false });
    expect(control.setFullscreen(true)).toEqual({ fullscreen: true, kioskLock: false });
  });
});
