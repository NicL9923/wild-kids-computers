import type { OsFamily } from '../../src/core/platform/bridge.ts';

/** The parts of Electron's before-input-event Input that decide a shortcut. */
export interface KeyInput {
  key: string;
  code: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export type BlockedShortcut = 'reload' | 'close' | 'quit' | 'zoom' | 'devtools';

const ZOOM_KEYS = new Set(['=', '+', '-', '_', '0']);
const ZOOM_CODES = new Set(['NumpadAdd', 'NumpadSubtract', 'Numpad0']);
const DEVTOOLS_CODES = new Set(['KeyI', 'KeyJ', 'KeyC']);

/**
 * Which app-level shortcut a key press is, if any. The main process cancels these outside an
 * unpackaged dev run, so a child cannot reload, close, zoom, or open DevTools by accident.
 * Everything else reaches the page, including the copy, paste, undo, and save shortcuts that
 * the shortcut workshop teaches.
 *
 * Ctrl or Command plus W reaches the page, because the toy desktop teaches it as Close. The real
 * window never closes from it: the application menu has no close accelerator, and any close goes
 * to the renderer as a close request first. Alt+F4 and Ctrl+F4 stay blocked, because Windows
 * closes the window from them itself.
 *
 * Letters match on `key`, not `code`, so a layout where Z sits on the W key keeps its undo.
 */
export function blockedShortcut(input: KeyInput, os: OsFamily): BlockedShortcut | null {
  const primary = os === 'mac' ? input.meta : input.control;
  const letter = input.key.length === 1 ? input.key.toLowerCase() : '';

  if (input.key === 'F12') return 'devtools';
  if (os === 'mac' && input.meta && input.alt && DEVTOOLS_CODES.has(input.code)) return 'devtools';
  if (os !== 'mac' && input.control && input.shift && (letter === 'i' || letter === 'j' || letter === 'c')) {
    return 'devtools';
  }

  if (input.key === 'F5' || (primary && letter === 'r')) return 'reload';
  if (input.key === 'F4' && (input.alt || input.control)) return 'close';
  if (primary && letter === 'q') return 'quit';
  if (primary && (ZOOM_KEYS.has(input.key) || ZOOM_CODES.has(input.code))) return 'zoom';
  return null;
}
