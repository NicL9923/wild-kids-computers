/** Each app's menus as data: which commands it has, and where they sit. */
import type { CommandId } from './commands.ts';
import type { AppKind } from './state.ts';

/** @public */
export type MenuId = 'file' | 'edit' | 'view' | 'go' | 'play';

/** The edit commands that work on the window's text field. */
const TEXT_EDIT: readonly CommandId[] = ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all'];

/** The menus of each app, left to right, and the commands in each, top to bottom. */
export const APP_MENUS: Readonly<Record<AppKind, readonly { id: MenuId; commands: readonly CommandId[] }[]>> = {
  notepad: [
    { id: 'file', commands: ['new', 'open', 'save', 'save-as', 'close'] },
    { id: 'edit', commands: TEXT_EDIT },
  ],
  'picture-viewer': [
    { id: 'file', commands: ['open', 'close'] },
    { id: 'view', commands: ['previous', 'next'] },
  ],
  'file-explorer': [
    { id: 'file', commands: ['open', 'new-folder', 'rename', 'delete', 'restore', 'empty-trash', 'close'] },
    { id: 'edit', commands: TEXT_EDIT },
    { id: 'go', commands: ['go-up'] },
  ],
  'music-box': [
    { id: 'file', commands: ['new', 'open', 'save', 'save-as', 'close'] },
    { id: 'edit', commands: ['undo', 'redo', 'clear'] },
    { id: 'play', commands: ['play', 'stop'] },
  ],
  calculator: [
    { id: 'file', commands: ['close'] },
    { id: 'edit', commands: ['copy', 'paste', 'clear'] },
  ],
  settings: [
    { id: 'file', commands: ['close'] },
    { id: 'edit', commands: TEXT_EDIT },
  ],
};

/** True when one of the app's menus has the command. */
export function appHasCommand(app: AppKind, command: CommandId): boolean {
  return APP_MENUS[app].some((menu) => menu.commands.includes(command));
}
