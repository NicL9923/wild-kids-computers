import type { WindowState } from '../../src/core/platform/bridge.ts';

/** How long the renderer has to say it is showing the parent gate before a close goes through. */
export const CLOSE_ACK_TIMEOUT_MS = 3_000;

/** The parts of BrowserWindow the kiosk lock uses. */
export interface LockableWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown;
  close(): void;
  /** Closes without running the page's unload handlers, which a hung page never finishes. */
  destroy(): void;
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  isKiosk(): boolean;
  setFullScreen(on: boolean): void;
  setKiosk(on: boolean): void;
}

export interface WindowControlOptions<Timer> {
  /** Tells the renderer someone tried to close the app. */
  notifyCloseRequest: () => void;
  setTimeout: (callback: () => void, ms: number) => Timer;
  clearTimeout: (timer: Timer) => void;
  ackTimeoutMs?: number;
}

/**
 * Fullscreen and kiosk lock for the main window. With the lock on, a close request goes to the
 * renderer, which shows the parent gate and answers at once. The app closes when the renderer
 * calls quit, or when it does not answer in time, because a hung app must still close.
 */
export function createWindowControl<Timer>(window: LockableWindow, options: WindowControlOptions<Timer>) {
  const ackTimeoutMs = options.ackTimeoutMs ?? CLOSE_ACK_TIMEOUT_MS;
  let kioskLock = false;
  let closeAllowed = false;
  let pendingAck: Timer | undefined;

  function clearPending(): void {
    if (pendingAck === undefined) return;
    options.clearTimeout(pendingAck);
    pendingAck = undefined;
  }

  function allowClose(): void {
    closeAllowed = true;
    clearPending();
    if (!window.isDestroyed()) window.close();
  }

  function forceClose(): void {
    closeAllowed = true;
    clearPending();
    if (!window.isDestroyed()) window.destroy();
  }

  window.on('close', (event) => {
    if (!kioskLock || closeAllowed) return;
    event.preventDefault();
    options.notifyCloseRequest();
    // Each attempt needs a fresh answer, so a renderer that answered once and then hung
    // still lets the next attempt through.
    clearPending();
    pendingAck = options.setTimeout(forceClose, ackTimeoutMs);
  });

  function state(): WindowState {
    return { fullscreen: window.isFullScreen() || window.isKiosk(), kioskLock };
  }

  return {
    getState: state,

    setFullscreen(on: boolean): WindowState {
      // Kiosk lock keeps the window fullscreen until the lock is turned off.
      if (!kioskLock) window.setFullScreen(on);
      return state();
    },

    setKioskLock(on: boolean): WindowState {
      kioskLock = on;
      window.setKiosk(on);
      if (!on) clearPending();
      return state();
    },

    /** The renderer is alive and showing the parent gate. */
    acknowledgeCloseRequest(): void {
      clearPending();
    },

    /** The renderer confirmed the quit. */
    allowClose,

    /** The renderer is gone or hung, or the system is shutting down. */
    forceClose,
  };
}
