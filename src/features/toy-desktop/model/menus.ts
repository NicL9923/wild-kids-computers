/**
 * Each app's menu bar, with whether each command can run right now. Enabled means the reducer
 * would run it: `isCommandEnabled` asks `reduce` with a clipboard that keeps nothing, so a menu
 * and the reducer can never disagree.
 */
import { APP_MENUS, type MenuId } from './appMenus.ts';
import { commandsForKey, SHORTCUTS, type CommandId, type KeyPress, type OsFamily, type Shortcut } from './commands.ts';
import { reduce } from './desktop.ts';
import { findWindow, type DesktopState } from './state.ts';
import type { TextClipboard } from './textEditor.ts';

/** @public */
export interface MenuItem {
  command: CommandId;
  enabled: boolean;
  shortcut: Shortcut | null;
}

export interface Menu {
  id: MenuId;
  items: MenuItem[];
}

/** True when the command would run in this window now. A command not in the app's menus never can. */
export function isCommandEnabled(
  state: DesktopState,
  windowId: string,
  command: CommandId,
  clipboard: TextClipboard,
): boolean {
  // A dry run must not change the clipboard, so copy and cut write nowhere.
  const dryRun = { clipboard: { read: () => clipboard.read(), write: () => undefined } };
  const { events } = reduce(state, { type: 'command', windowId, command }, dryRun);
  return events.every((event) => event.type !== 'rejected');
}

/** The menu bar of a window, with each command's state and shortcut. Empty for no such window. */
export function menuBar(state: DesktopState, windowId: string, clipboard: TextClipboard): Menu[] {
  const window = findWindow(state, windowId);
  if (window === undefined) return [];
  return APP_MENUS[window.app.kind].map((menu) => ({
    id: menu.id,
    items: menu.commands.map((command) => ({
      command,
      enabled: isCommandEnabled(state, windowId, command, clipboard),
      shortcut: SHORTCUTS[command] ?? null,
    })),
  }));
}

/**
 * The command a key press runs in this window, or null. Only enabled commands count, so Space
 * plays a stopped music box and stops a playing one. A screen sends a key to a focused text
 * field first, so Space and Delete type and delete there.
 */
export function commandForKey(
  state: DesktopState,
  windowId: string,
  press: KeyPress,
  os: OsFamily,
  clipboard: TextClipboard,
): CommandId | null {
  return commandsForKey(press, os).find((command) => isCommandEnabled(state, windowId, command, clipboard)) ?? null;
}
