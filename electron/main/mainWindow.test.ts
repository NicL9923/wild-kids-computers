import { describe, expect, it } from 'vitest';
import type { OsFamily } from '../../src/core/platform/bridge.ts';
import { showWhenReady, type ShowableWindow } from './mainWindow.ts';

/** A window whose events the test fires by hand. It records each show. */
function fakeWindow() {
  const listeners = new Map<string, () => void>();
  const record = { shows: 0, visible: false, destroyed: false };
  const window: ShowableWindow = {
    once: (event, listener) => listeners.set(event, listener),
    isDestroyed: () => record.destroyed,
    isVisible: () => record.visible,
    show: () => {
      record.shows += 1;
      record.visible = true;
    },
    webContents: { once: (event, listener) => listeners.set(event, listener) },
  };
  const fire = (event: 'ready-to-show' | 'did-finish-load') => listeners.get(event)?.();
  return { window, record, fire };
}

describe('showWhenReady', () => {
  it.each<[OsFamily, number]>([
    ['linux', 1],
    ['mac', 0],
    ['windows', 0],
  ])('on %s, a loaded page that never painted shows the window %i times', (os, shows) => {
    // Wayland never paints a hidden window, so only Linux may show it on load.
    const { window, record, fire } = fakeWindow();
    showWhenReady(window, os);
    fire('did-finish-load');
    expect(record.shows).toBe(shows);
  });

  it('shows the window once when both the first paint and the load arrive', () => {
    const { window, record, fire } = fakeWindow();
    showWhenReady(window, 'linux');
    fire('did-finish-load');
    fire('ready-to-show');
    expect(record.shows).toBe(1);
  });

  it('shows on the first paint on every system', () => {
    const { window, record, fire } = fakeWindow();
    showWhenReady(window, 'mac');
    fire('ready-to-show');
    expect(record.shows).toBe(1);
  });

  it('leaves a window that was destroyed before its page loaded', () => {
    const { window, record, fire } = fakeWindow();
    showWhenReady(window, 'linux');
    record.destroyed = true;
    fire('did-finish-load');
    expect(record.shows).toBe(0);
  });
});
