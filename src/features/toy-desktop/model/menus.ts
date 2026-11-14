/**
 * Each app's menu bar as data, and whether each command can run right now. A screen draws the
 * menus from `menuBar`; running a command is the `command` action in `desktop.ts`, which checks
 * the same `isCommandEnabled`.
 */
import { copyableNumber, pasteNumber } from './apps/calculator.ts';
import { isEmptyTune } from './apps/tune.ts';
import { commandsForKey, SHORTCUTS, type CommandId, type KeyPress, type OsFamily, type Shortcut } from './commands.ts';
import { activeField, getField } from './fields.ts';
import {
  filesOfKind,
  getNode,
  HOME_ID,
  isFile,
  isTrashed,
  listFolder,
  TRASH_ID,
  type FileSystem,
} from './fileSystem.ts';
import {
  findWindow,
  hasUnsavedChanges,
  MAX_WINDOWS,
  type AppKind,
  type DesktopState,
  type WindowState,
} from './state.ts';
import { canRedo, canUndo, hasSelection, type TextClipboard } from './textEditor.ts';

/** @public */
export type MenuId = 'file' | 'edit' | 'view' | 'go' | 'play';

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

const TEXT_EDIT: readonly CommandId[] = ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all'];

/** The menus of each app, left to right, and the commands in each, top to bottom. */
const APP_MENUS: Readonly<Record<AppKind, readonly { id: MenuId; commands: readonly CommandId[] }[]>> = {
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

function clipboardText(clipboard: TextClipboard): string {
  return clipboard.read()?.text ?? '';
}

function textCommandEnabled(window: WindowState, command: CommandId, clipboard: TextClipboard): boolean {
  const field = activeField(window.app);
  const editor = field === null ? undefined : getField(window.app, field);
  if (editor === undefined) return false;
  switch (command) {
    case 'undo':
      return canUndo(editor);
    case 'redo':
      return canRedo(editor);
    case 'cut':
    case 'copy':
      return hasSelection(editor);
    case 'paste':
      return clipboardText(clipboard) !== '';
    case 'select-all':
      return editor.text !== '';
    default:
      return false;
  }
}

/** True for a picture the viewer can step away from: another picture shares its folder. */
function hasNeighbourPictures(fs: FileSystem, fileId: string | null): boolean {
  const file = fileId === null ? undefined : getNode(fs, fileId);
  if (!isFile(file) || file.parentId === null || isTrashed(fs, file.id)) return false;
  return filesOfKind(fs, file.parentId, 'picture').length > 1;
}

function explorerCommandEnabled(state: DesktopState, window: WindowState, command: CommandId): boolean | null {
  if (window.app.kind !== 'file-explorer') return null;
  const { fs } = state;
  const { folderId, selectedId, rename } = window.app;
  const selected = selectedId === null ? undefined : getNode(fs, selectedId);
  const fixed = selectedId === HOME_ID || selectedId === TRASH_ID;
  switch (command) {
    case 'open':
      return selected !== undefined && selected.parentId !== TRASH_ID;
    case 'new-folder':
      return folderId !== TRASH_ID && !isTrashed(fs, folderId) && rename === null;
    case 'rename':
    case 'delete':
      return selected !== undefined && !fixed && !isTrashed(fs, selected.id) && rename === null;
    case 'restore':
      return selected?.parentId === TRASH_ID;
    case 'empty-trash':
      return listFolder(fs, TRASH_ID).length > 0;
    case 'go-up':
      return folderId !== HOME_ID;
    default:
      return null;
  }
}

/** True when the command can run in this window now. A command not in the app's menus never can. */
export function isCommandEnabled(
  state: DesktopState,
  windowId: string,
  command: CommandId,
  clipboard: TextClipboard,
): boolean {
  const window = findWindow(state, windowId);
  if (window === undefined || window.minimized) return false;
  const { app } = window;
  if (!APP_MENUS[app.kind].some((menu) => menu.commands.includes(command))) return false;
  if (command === 'close') return true;
  const dialogOpen = 'dialog' in app && app.dialog !== null;
  if (TEXT_EDIT.includes(command) && activeField(app) !== null) return textCommandEnabled(window, command, clipboard);
  if (dialogOpen) return false;
  const explorer = explorerCommandEnabled(state, window, command);
  if (explorer !== null) return explorer;
  switch (command) {
    case 'new':
      return state.windows.length < MAX_WINDOWS;
    case 'open':
    case 'save-as':
      return true;
    case 'save':
      return ('fileId' in app && app.fileId === null) || hasUnsavedChanges(app);
    case 'previous':
    case 'next':
      return app.kind === 'picture-viewer' && hasNeighbourPictures(state.fs, app.fileId);
    case 'play':
      return app.kind === 'music-box' && !app.playing;
    case 'stop':
      return app.kind === 'music-box' && app.playing;
    case 'undo':
      return app.kind === 'music-box' && app.undo.length > 0;
    case 'redo':
      return app.kind === 'music-box' && app.redo.length > 0;
    case 'clear':
      return app.kind === 'calculator' || (app.kind === 'music-box' && !isEmptyTune(app.tune));
    case 'copy':
      return app.kind === 'calculator' && copyableNumber(app) !== null;
    case 'paste':
      return app.kind === 'calculator' && pasteNumber(app, clipboardText(clipboard)) !== null;
    default:
      return false;
  }
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
