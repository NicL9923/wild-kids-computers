import { describe, expect, it } from 'vitest';
import { claimSingleInstance, type FocusableWindow, type SingleInstanceApp } from './singleInstance.ts';

/** Electron's app with a lock that is either free or already held by another instance. */
function fakeApp(lockFree: boolean) {
  const listeners: Array<() => void> = [];
  const app: SingleInstanceApp = {
    requestSingleInstanceLock: () => lockFree,
    on(event, listener) {
      if (event !== 'second-instance') throw new Error(`Unexpected event ${event as string}`);
      listeners.push(listener);
    },
  };
  return { app, launchAgain: () => listeners.forEach((listener) => listener()), listeners };
}

function fakeWindow(state: { minimized?: boolean; destroyed?: boolean } = {}) {
  const calls: string[] = [];
  const window: FocusableWindow = {
    isDestroyed: () => state.destroyed ?? false,
    isMinimized: () => state.minimized ?? false,
    restore: () => calls.push('restore'),
    focus: () => calls.push('focus'),
  };
  return { window, calls };
}

describe('claimSingleInstance', () => {
  it('refuses when another instance holds the lock, and listens for nothing', () => {
    const { app, listeners } = fakeApp(false);
    expect(claimSingleInstance(app, () => undefined)).toBe(false);
    // The caller exits; a listener here would mean this process acts as the primary.
    expect(listeners).toHaveLength(0);
  });

  it('takes a free lock', () => {
    expect(claimSingleInstance(fakeApp(true).app, () => undefined)).toBe(true);
  });

  it.each([
    ['a minimized window is restored, then focused', true, ['restore', 'focus']],
    ['a window behind others is focused', false, ['focus']],
  ])('on a second launch %s', (_label, minimized, expected) => {
    const { app, launchAgain } = fakeApp(true);
    const { window, calls } = fakeWindow({ minimized });
    claimSingleInstance(app, () => window);
    launchAgain();
    expect(calls).toEqual(expected);
  });

  it('leaves a closed window alone on a second launch', () => {
    const { app, launchAgain } = fakeApp(true);
    const { window, calls } = fakeWindow({ destroyed: true, minimized: true });
    claimSingleInstance(app, () => window);
    launchAgain();
    expect(calls).toEqual([]);
  });

  it('does nothing on a second launch before the window exists', () => {
    const { app, launchAgain } = fakeApp(true);
    claimSingleInstance(app, () => undefined);
    expect(launchAgain).not.toThrow();
  });
});
