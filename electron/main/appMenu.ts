import type { MenuItemConstructorOptions } from 'electron';
import type { OsFamily } from '../../src/core/platform/bridge.ts';

/**
 * The application menu holds only the edit roles. macOS needs them for copy, paste, and undo in
 * text fields, and their copy and paste fire the DOM events that src/app/inputGuards.ts routes
 * to the toy clipboard. Leaving out Electron's default menu also drops its reload, zoom, close,
 * and DevTools accelerators. macOS turns the first menu into the app menu, so it gets an empty
 * one first.
 */
export function appMenuTemplate(os: OsFamily, appName: string): MenuItemConstructorOptions[] {
  const edit: MenuItemConstructorOptions = { role: 'editMenu' };
  return os === 'mac' ? [{ label: appName, submenu: [] }, edit] : [edit];
}
