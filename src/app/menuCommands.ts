import type { MenuCommand } from '../core/platform/bridge.ts';

/** The macOS shortcut for each command the Edit menu sends. */
const SHORTCUTS: Readonly<Record<MenuCommand, { key: string; shiftKey: boolean }>> = {
  undo: { key: 'z', shiftKey: false },
  redo: { key: 'z', shiftKey: true },
};

/**
 * Runs Undo or Redo chosen from the macOS Edit menu. The main process sends it here instead of
 * using the browser's undo, which knows nothing of the text models activities keep. The command
 * reaches the focused element as its shortcut, so an activity handles it exactly as it handles
 * Command+Z. A field that does not handle the shortcut, such as a plain input in the parent
 * corner, gets the browser's own undo.
 */
export function runMenuCommand(command: MenuCommand, doc: Document): void {
  const target = doc.activeElement ?? doc.body;
  const { key, shiftKey } = SHORTCUTS[command];
  const press = new KeyboardEvent('keydown', { key, metaKey: true, shiftKey, bubbles: true, cancelable: true });
  const handled = !target.dispatchEvent(press);
  if (!handled) doc.execCommand(command);
}
