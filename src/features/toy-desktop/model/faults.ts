/**
 * Simple problems for the "Fix it" lesson. `applyFault` puts a desktop into a broken state and
 * `isFaultFixed` says when the child has solved it, by whatever route: the task strip, the
 * window buttons, a drag, or the keyboard.
 */
import { MIN_VISIBLE_TITLE_BAR, visibleFraction } from './geometry.ts';
import { findWindow, topVisibleWindow, type DesktopState, type WindowState } from './state.ts';

/** A window counts as back in view when this share of it is on the desktop. */
export const MOSTLY_VISIBLE = 0.75;

export type Fault =
  /** The sound is muted. Fixed when it is unmuted with the volume above zero. */
  | { kind: 'sound-muted' }
  /** The window is minimized. Fixed when it is back on the desktop. */
  | { kind: 'window-minimized'; windowId: string }
  /** Another window sits on top of this one and covers it. Fixed when this window is in front. */
  | { kind: 'window-behind'; windowId: string; coveredBy: string }
  /** The window is pushed off to one side, with only a grab-sized part of its title bar showing. */
  | { kind: 'window-off-side'; windowId: string; side: 'left' | 'right' }
  /** Other windows are in front and one of them has focus. Fixed when this window has focus. */
  | { kind: 'wrong-app-in-front'; windowId: string };

function windowOrThrow(state: DesktopState, windowId: string): WindowState {
  const window = findWindow(state, windowId);
  if (window === undefined) throw new Error(`applyFault: no window ${windowId}`);
  return window;
}

function replace(state: DesktopState, window: WindowState): DesktopState {
  return { ...state, windows: state.windows.map((other) => (other.id === window.id ? window : other)) };
}

function sendToBack(state: DesktopState, window: WindowState): DesktopState {
  const windows = [window, ...state.windows.filter((other) => other.id !== window.id)];
  const next = { ...state, windows };
  return { ...next, focusedWindowId: topVisibleWindow(next, window.id)?.id ?? null };
}

/** Returns the desktop with the problem in place. An unknown window is an author's mistake and throws. */
export function applyFault(state: DesktopState, fault: Fault): DesktopState {
  switch (fault.kind) {
    case 'sound-muted':
      return { ...state, system: { ...state.system, muted: true } };
    case 'window-minimized': {
      const window = windowOrThrow(state, fault.windowId);
      const next = replace(state, { ...window, minimized: true });
      // Focus always sits on the front window that is not minimized.
      return { ...next, focusedWindowId: topVisibleWindow(next)?.id ?? null };
    }
    case 'window-behind': {
      const window = windowOrThrow(state, fault.windowId);
      const cover = windowOrThrow(state, fault.coveredBy);
      const covering: WindowState = { ...cover, minimized: false, maximized: false, rect: { ...window.rect } };
      const windows = [
        { ...window, minimized: false },
        ...state.windows.filter((other) => other.id !== window.id && other.id !== cover.id),
        covering,
      ];
      return { ...state, windows, focusedWindowId: cover.id };
    }
    case 'window-off-side': {
      const window = windowOrThrow(state, fault.windowId);
      const x =
        fault.side === 'left' ? MIN_VISIBLE_TITLE_BAR - window.rect.width : state.size.width - MIN_VISIBLE_TITLE_BAR;
      return replace(state, { ...window, minimized: false, maximized: false, rect: { ...window.rect, x } });
    }
    // 'wrong-app-in-front', the last case.
    default: {
      const window = windowOrThrow(state, fault.windowId);
      const next = sendToBack(state, window);
      if (next.focusedWindowId === null) throw new Error('applyFault: wrong-app-in-front needs another visible window');
      return next;
    }
  }
}

/** True when the child has solved the problem. */
export function isFaultFixed(state: DesktopState, fault: Fault): boolean {
  if (fault.kind === 'sound-muted') return !state.system.muted && state.system.volume > 0;
  const window = findWindow(state, fault.windowId);
  if (window === undefined) return false;
  switch (fault.kind) {
    case 'window-minimized':
      return !window.minimized;
    case 'window-off-side':
      return !window.minimized && (window.maximized || visibleFraction(window.rect, state.size) >= MOSTLY_VISIBLE);
    // 'window-behind' and 'wrong-app-in-front'. Focus always sits on the front window that is not
    // minimized, so a focused window is in front and not covered.
    default:
      return state.focusedWindowId === window.id;
  }
}
