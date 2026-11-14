import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand, OsFamily } from '../../src/core/platform/bridge.ts';

export type { MenuCommand };

/**
 * The application menu holds only the edit commands. macOS needs them for copy, paste, and undo
 * in text fields, and their copy and paste fire the DOM events that src/app/inputGuards.ts
 * routes to the toy clipboard. Leaving out Electron's default menu also drops its reload, zoom,
 * close, and DevTools accelerators. macOS turns the first menu into the app menu, so it gets an
 * empty one first.
 *
 * On macOS a child can choose Undo and Redo from the menu bar. The browser's own undo knows
 * nothing of the text models activities keep, so those two items call `send`, which passes the
 * command to the page (src/app/menuCommands.ts). Their shortcuts reach the page first anyway: the
 * menu runs one only when the page leaves it alone. Windows and Linux hide the menu bar, so they
 * keep the plain edit role.
 */
export function appMenuTemplate(
  os: OsFamily,
  appName: string,
  send: (command: MenuCommand) => void,
): MenuItemConstructorOptions[] {
  if (os !== 'mac') return [{ role: 'editMenu' }];
  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'Command+Z', click: () => send('undo') },
      { label: 'Redo', accelerator: 'Shift+Command+Z', click: () => send('redo') },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };
  return [{ label: appName, submenu: [] }, edit];
}
