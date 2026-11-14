/**
 * The toy desktop reducer: `reduce(state, action, env)` returns the next state and the events
 * that happened. It is pure apart from the injected clipboard, which copy and cut write and
 * paste reads. Writing the same content twice is harmless, so calling it twice for one action
 * is safe.
 */
import { copyableNumber, createCalculator, pasteNumber, pressKey, type CalculatorKey } from './apps/calculator.ts';
import { clearGrid, createGrid, play, redoGrid, stop, tick, toggleCell, undoGrid } from './apps/musicBox.ts';
import { applySettingsAction, createSettingsPanel, type SettingsAction } from './apps/settingsPanel.ts';
import { emptyTune, isEmptyTune } from './apps/tune.ts';
import type { CommandId } from './commands.ts';
import type { DesktopEvent, RejectReason } from './events.ts';
import { activeField, getField, setField, type TextFieldId } from './fields.ts';
import {
  createUntitledFolder,
  emptyTrash,
  filesOfKind,
  getNode,
  HOME_ID,
  isFile,
  isFolder,
  isTrashed,
  listFolder,
  MAX_NOTE_LENGTH,
  moveNode,
  overwriteFile,
  renameNode,
  restoreNode,
  saveNewFile,
  searchByName,
  trashNode,
  TRASH_ID,
  type FileContent,
  type FileKind,
  type FileNode,
  type FileSystem,
  type FsNode,
} from './fileSystem.ts';
import {
  cascadeRect,
  clampDesktopSize,
  clampWindowPosition,
  clampWindowRect,
  clampWindowSize,
  fullRect,
  type Rect,
  type Size,
} from './geometry.ts';
import { isCommandEnabled } from './menus.ts';
import { checkName, MAX_NAME_LENGTH, sameName } from './names.ts';
import {
  findWindow,
  hasUnsavedChanges,
  MAX_WINDOWS,
  topVisibleWindow,
  type AppKind,
  type AppState,
  type DesktopState,
  type FileDialog,
  type FileExplorerState,
  type WindowState,
} from './state.ts';
import { applyTextOp, createEditor, type TextClipboard, type TextEditOp, type TextOp } from './textEditor.ts';

export interface DesktopEnv {
  /** The app's `toyClipboard`, or `createMemoryClipboard()` in a test. */
  clipboard: TextClipboard;
}

export interface Transition {
  state: DesktopState;
  events: DesktopEvent[];
}

export type ExplorerAction =
  /** Single click on an item: a folder opens in this window, a file opens in its app. */
  | { type: 'open-node'; nodeId: string }
  | { type: 'select'; nodeId: string | null }
  /** The end of a carry: the item lands in the folder. Moving into the trash deletes it. */
  | { type: 'move'; nodeId: string; toId: string }
  | { type: 'start-rename'; nodeId: string }
  | { type: 'commit-rename' }
  | { type: 'cancel-rename' }
  | { type: 'clear-search' };

/** @public */
export type DialogAction =
  /** Single click on a folder, or a place such as Home in the dialog's side list. */
  | { type: 'open-folder'; folderId: string }
  | { type: 'go-up' }
  /** Single click on an item. A folder opens; a file is selected. */
  | { type: 'select'; nodeId: string }
  | { type: 'confirm' }
  | { type: 'cancel' };

/** @public */
export type MusicBoxAction = { type: 'toggle'; step: number; note: number } | { type: 'tick' };

export type DesktopAction =
  | { type: 'open-app'; app: AppKind }
  /** Opens a file in its app, or brings forward the window that already shows it. */
  | { type: 'open-file'; fileId: string }
  | { type: 'close-window'; windowId: string }
  /** A click on a window that is not minimized. */
  | { type: 'focus-window'; windowId: string }
  /** The window's top left corner goes here, kept reachable. A maximized window is restored first. */
  | { type: 'move-window'; windowId: string; x: number; y: number }
  /** The bottom right handle: the top left corner stays and the size clamps to the limits. */
  | { type: 'resize-window'; windowId: string; width: number; height: number }
  | { type: 'minimize-window'; windowId: string }
  | { type: 'maximize-window'; windowId: string }
  | { type: 'unmaximize-window'; windowId: string }
  /** A click on the window's button in the task strip: restores it if minimized and brings it forward. */
  | { type: 'activate-window'; windowId: string }
  /** The keyboard window switch: the window at the back comes forward, so repeats reach every window. */
  | { type: 'focus-next-window' }
  | { type: 'set-desktop-size'; width: number; height: number }
  /** A menu command or its shortcut. Refused when `isCommandEnabled` is false. */
  | { type: 'command'; windowId: string; command: CommandId }
  | { type: 'text'; windowId: string; field: TextFieldId; op: TextEditOp }
  | { type: 'dialog'; windowId: string; action: DialogAction }
  | { type: 'explorer'; windowId: string; action: ExplorerAction }
  | { type: 'music-box'; windowId: string; action: MusicBoxAction }
  | { type: 'calculator'; windowId: string; key: CalculatorKey }
  | { type: 'settings'; windowId: string; action: SettingsAction }
  | { type: 'set-volume'; volume: number }
  | { type: 'set-muted'; muted: boolean };

/** The name a new folder gets before the child types one. A file system name, not interface text. */
export const NEW_FOLDER_NAME = 'New folder';

/** The size each app's window opens at. */
const DEFAULT_WINDOW_SIZES: Readonly<Record<AppKind, Size>> = {
  notepad: { width: 560, height: 400 },
  'picture-viewer': { width: 640, height: 480 },
  'file-explorer': { width: 640, height: 440 },
  'music-box': { width: 600, height: 400 },
  calculator: { width: 300, height: 420 },
  settings: { width: 520, height: 480 },
};

type Step = Transition | RejectReason;

const done = (state: DesktopState, ...events: DesktopEvent[]): Transition => ({ state, events });

function then(first: Transition, next: (state: DesktopState) => Step): Step {
  const second = next(first.state);
  if (typeof second === 'string') return second;
  return { state: second.state, events: [...first.events, ...second.events] };
}

/** A fresh app of a kind, with nothing open. */
function createApp(kind: AppKind, state: DesktopState): AppState {
  switch (kind) {
    case 'notepad':
      return {
        kind,
        fileId: null,
        editor: createEditor({ multiline: true, maxLength: MAX_NOTE_LENGTH }),
        savedText: '',
        dialog: null,
      };
    case 'picture-viewer':
      return { kind, fileId: null, dialog: null };
    case 'file-explorer':
      return {
        kind,
        folderId: HOME_ID,
        selectedId: null,
        search: createEditor({ maxLength: MAX_NAME_LENGTH }),
        rename: null,
      };
    case 'music-box':
      return { ...createGrid(), kind, fileId: null, savedTune: emptyTune(), dialog: null };
    case 'calculator':
      return createCalculator();
    // 'settings', the last case.
    default:
      return createSettingsPanel(state.settings);
  }
}

const FILE_FOR_APP: Readonly<Partial<Record<AppKind, FileKind>>> = {
  notepad: 'note',
  'picture-viewer': 'picture',
  'music-box': 'tune',
};

function appForFile(file: FileNode): AppState {
  switch (file.kind) {
    case 'note': {
      const editor = createEditor({ text: file.text, multiline: true, maxLength: MAX_NOTE_LENGTH });
      return { kind: 'notepad', fileId: file.id, editor, savedText: editor.text, dialog: null };
    }
    case 'picture':
      return { kind: 'picture-viewer', fileId: file.id, dialog: null };
    // 'tune', the last case.
    default:
      return { ...createGrid(file.tune), kind: 'music-box', fileId: file.id, savedTune: file.tune, dialog: null };
  }
}

/** The rectangle a window covers on the desktop: the whole desktop while maximized. */
export function windowFrame(state: DesktopState, window: WindowState): Rect {
  return window.maximized ? fullRect(state.size) : window.rect;
}

/** What a file explorer lists: search matches while the search field holds text, else the folder. */
export function explorerItems(fs: FileSystem, explorer: FileExplorerState): FsNode[] {
  return explorer.search.text.trim() === ''
    ? listFolder(fs, explorer.folderId)
    : searchByName(fs, explorer.search.text);
}

function replaceWindow(state: DesktopState, window: WindowState): DesktopState {
  return { ...state, windows: state.windows.map((other) => (other.id === window.id ? window : other)) };
}

function withApp(state: DesktopState, window: WindowState, app: AppState): DesktopState {
  return replaceWindow(state, { ...window, app });
}

/** Brings a window to the front and focuses it. */
function bringToFront(state: DesktopState, windowId: string): Transition {
  const window = findWindow(state, windowId);
  if (window === undefined) return done(state);
  const windows = [...state.windows.filter((other) => other.id !== windowId), window];
  const next = { ...state, windows, focusedWindowId: windowId };
  return state.focusedWindowId === windowId ? done(next) : done(next, { type: 'window-focused', windowId });
}

/** Moves focus away from a window that is closing or minimizing, to the front visible window. */
function focusAfterLeaving(state: DesktopState, leavingId: string): Transition {
  if (state.focusedWindowId !== leavingId) return done(state);
  const next = topVisibleWindow(state, leavingId);
  if (next === undefined) return done({ ...state, focusedWindowId: null });
  return bringToFront(state, next.id);
}

function openWindow(state: DesktopState, app: AppState): Step {
  if (state.windows.length >= MAX_WINDOWS) return 'too-many-windows';
  const windowId = `w${state.nextWindowId}`;
  const rect = cascadeRect(
    DEFAULT_WINDOW_SIZES[app.kind],
    state.size,
    state.windows.map((window) => window.rect),
  );
  const window: WindowState = { id: windowId, rect, minimized: false, maximized: false, app };
  const next = {
    ...state,
    nextWindowId: state.nextWindowId + 1,
    windows: [...state.windows, window],
    focusedWindowId: windowId,
  };
  return done(next, { type: 'window-opened', windowId, app: app.kind }, { type: 'window-focused', windowId });
}

function activate(state: DesktopState, window: WindowState): Transition {
  if (!window.minimized) return bringToFront(state, window.id);
  const restored = replaceWindow(state, { ...window, minimized: false });
  const front = bringToFront(restored, window.id);
  return { state: front.state, events: [{ type: 'window-restored', windowId: window.id }, ...front.events] };
}

function openedEvents(window: WindowState, file: FileNode): DesktopEvent[] {
  const opened: DesktopEvent = { type: 'file-opened', windowId: window.id, nodeId: file.id };
  return file.kind === 'picture' ? [opened, { type: 'picture-shown', windowId: window.id, nodeId: file.id }] : [opened];
}

function openFile(state: DesktopState, fileId: string): Step {
  const file = getNode(state.fs, fileId);
  if (file === undefined) return 'not-found';
  if (!isFile(file)) return 'not-a-file';
  if (isTrashed(state.fs, fileId)) return 'in-trash';
  const showing = state.windows.find((window) => 'fileId' in window.app && window.app.fileId === fileId);
  if (showing !== undefined) return activate(state, showing);
  const opened = openWindow(state, appForFile(file));
  if (typeof opened === 'string') return opened;
  const window = opened.state.windows.at(-1);
  return window === undefined ? opened : { ...opened, events: [...opened.events, ...openedEvents(window, file)] };
}

function closeWindow(state: DesktopState, window: WindowState): Transition {
  const unsavedChanges = hasUnsavedChanges(window.app);
  const refocused = focusAfterLeaving(state, window.id);
  const windows = refocused.state.windows.filter((other) => other.id !== window.id);
  return {
    state: { ...refocused.state, windows },
    events: [{ type: 'window-closed', windowId: window.id, app: window.app.kind, unsavedChanges }, ...refocused.events],
  };
}

function moveWindow(state: DesktopState, window: WindowState, x: number, y: number): Step {
  if (window.minimized) return 'minimized';
  const rect = clampWindowPosition({ ...window.rect, x, y }, state.size);
  const events: DesktopEvent[] = [];
  if (window.maximized) events.push({ type: 'window-unmaximized', windowId: window.id });
  if (rect.x !== window.rect.x || rect.y !== window.rect.y)
    events.push({ type: 'window-moved', windowId: window.id, rect });
  const front = bringToFront(replaceWindow(state, { ...window, rect, maximized: false }), window.id);
  return { state: front.state, events: [...events, ...front.events] };
}

function resizeWindow(state: DesktopState, window: WindowState, width: number, height: number): Step {
  if (window.minimized) return 'minimized';
  if (window.maximized) return 'maximized';
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'not-an-option';
  const size = clampWindowSize({ width, height }, state.size);
  const clamped = size.width !== Math.round(width) || size.height !== Math.round(height);
  const rect = clampWindowPosition({ ...window.rect, ...size }, state.size);
  const changed = rect.width !== window.rect.width || rect.height !== window.rect.height || rect.x !== window.rect.x;
  const front = bringToFront(replaceWindow(state, { ...window, rect }), window.id);
  const events: DesktopEvent[] =
    changed || clamped ? [{ type: 'window-resized', windowId: window.id, rect, clamped }] : [];
  return { state: front.state, events: [...events, ...front.events] };
}

function minimizeWindow(state: DesktopState, window: WindowState): Transition {
  if (window.minimized) return done(state);
  const refocused = focusAfterLeaving(state, window.id);
  const current = findWindow(refocused.state, window.id) ?? window;
  return {
    state: replaceWindow(refocused.state, { ...current, minimized: true }),
    events: [{ type: 'window-minimized', windowId: window.id }, ...refocused.events],
  };
}

function maximizeWindow(state: DesktopState, window: WindowState): Transition {
  if (window.maximized && !window.minimized) return bringToFront(state, window.id);
  const events: DesktopEvent[] = [];
  if (window.minimized) events.push({ type: 'window-restored', windowId: window.id });
  if (!window.maximized) events.push({ type: 'window-maximized', windowId: window.id });
  const front = bringToFront(replaceWindow(state, { ...window, maximized: true, minimized: false }), window.id);
  return { state: front.state, events: [...events, ...front.events] };
}

function unmaximizeWindow(state: DesktopState, window: WindowState): Transition {
  if (!window.maximized) return done(state);
  const front = bringToFront(replaceWindow(state, { ...window, maximized: false }), window.id);
  return { state: front.state, events: [{ type: 'window-unmaximized', windowId: window.id }, ...front.events] };
}

function setDesktopSize(state: DesktopState, width: number, height: number): Step {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'not-an-option';
  const size = clampDesktopSize({ width, height });
  const windows = state.windows.map((window) => ({ ...window, rect: clampWindowRect(window.rect, size) }));
  return done({ ...state, size, windows }, { type: 'desktop-resized', size });
}

function setVolume(state: DesktopState, volume: number): Step {
  if (!Number.isFinite(volume)) return 'not-an-option';
  const level = Math.min(Math.max(Math.round(volume), 0), 100);
  const events: DesktopEvent[] = [];
  if (level !== state.system.volume) events.push({ type: 'volume-changed', volume: level });
  // Moving the volume up unmutes, as on real computers.
  const muted = state.system.muted && level === 0;
  if (muted !== state.system.muted) events.push({ type: 'mute-changed', muted });
  return done({ ...state, system: { volume: level, muted } }, ...events);
}

function setMuted(state: DesktopState, muted: boolean): Transition {
  if (muted === state.system.muted) return done(state);
  return done({ ...state, system: { ...state.system, muted } }, { type: 'mute-changed', muted });
}

// Text fields

function editField(state: DesktopState, window: WindowState, field: TextFieldId, op: TextOp, env: DesktopEnv): Step {
  const editor = getField(window.app, field);
  if (editor === undefined) return 'no-text-field';
  const result = applyTextOp(editor, op, env.clipboard);
  let next = withApp(state, window, setField(window.app, field, result.editor));
  const events: DesktopEvent[] = [];
  const windowId = window.id;
  if (result.copied !== undefined)
    events.push({ type: op.type === 'cut' ? 'cut' : 'copied', windowId, text: result.copied });
  if (op.type === 'paste' && result.pasted !== undefined)
    events.push({ type: 'pasted', windowId, text: result.pasted });
  if (op.type === 'undo' && result.changed) events.push({ type: 'undone', windowId });
  if (op.type === 'redo' && result.changed) events.push({ type: 'redone', windowId });
  if (result.changed) {
    events.push({ type: 'text-changed', windowId, field, text: result.editor.text });
    if (field === 'computer-name') {
      next = { ...next, settings: { ...next.settings, computerName: result.editor.text } };
      events.push({ type: 'setting-changed', setting: 'computerName', value: result.editor.text });
    }
  }
  return done(next, ...events);
}

// Documents: the notepad, the picture viewer, and the music box

type DocumentApp = Extract<AppState, { dialog: FileDialog | null }>;

function isDocumentApp(app: AppState): app is DocumentApp {
  return 'dialog' in app;
}

function documentContent(app: DocumentApp): FileContent | null {
  if (app.kind === 'notepad') return { kind: 'note', text: app.editor.text };
  if (app.kind === 'music-box') return { kind: 'tune', tune: app.tune };
  return null;
}

function markSaved(app: DocumentApp, fileId: string): DocumentApp {
  if (app.kind === 'notepad') return { ...app, fileId, savedText: app.editor.text, dialog: null };
  if (app.kind === 'music-box') return { ...app, fileId, savedTune: app.tune, dialog: null };
  return { ...app, fileId, dialog: null };
}

/** A document window that shows nothing yet, where an opened file can load in place. */
function isBlank(app: DocumentApp): boolean {
  if (app.fileId !== null) return false;
  if (app.kind === 'notepad') return app.editor.text === '';
  if (app.kind === 'music-box') return isEmptyTune(app.tune);
  return true;
}

/** The folder a dialog starts in: the folder of the open file, or home. */
function startFolder(fs: FileSystem, app: DocumentApp): string {
  const file = app.fileId === null ? undefined : getNode(fs, app.fileId);
  if (file?.parentId == null || isTrashed(fs, file.id)) return HOME_ID;
  return file.parentId;
}

function openDialog(state: DesktopState, window: WindowState, app: DocumentApp, mode: FileDialog['mode']): Transition {
  const file = app.fileId === null ? undefined : getNode(state.fs, app.fileId);
  const name = createEditor({ text: mode === 'save-as' ? (file?.name ?? '') : '', maxLength: MAX_NAME_LENGTH });
  const dialog: FileDialog = {
    mode,
    folderId: startFolder(state.fs, app),
    selectedId: null,
    // The whole name starts selected, so typing replaces it.
    name: { ...name, anchor: 0 },
    replaceId: null,
  };
  return done(withApp(state, window, { ...app, dialog }), { type: 'dialog-opened', windowId: window.id, mode });
}

function saveDocument(state: DesktopState, window: WindowState, app: DocumentApp): Step {
  const content = documentContent(app);
  if (content === null) return 'command-disabled';
  if (app.fileId !== null) {
    const saved = overwriteFile(state.fs, app.fileId, content);
    if (saved.ok) {
      const next = withApp({ ...state, fs: saved.fs }, window, markSaved(app, app.fileId));
      const folderId = saved.node.parentId ?? HOME_ID;
      return done(next, {
        type: 'file-saved',
        windowId: window.id,
        nodeId: app.fileId,
        folderId,
        kind: content.kind,
        how: 'update',
      });
    }
  }
  // A note never saved, or whose file is gone or in the trash, needs a name and a place.
  return openDialog(state, window, app, 'save-as');
}

function confirmSave(state: DesktopState, window: WindowState, app: DocumentApp, dialog: FileDialog): Step {
  const content = documentContent(app);
  if (content === null) return 'command-disabled';
  const check = checkName(dialog.name.text, []);
  if (!check.ok) return check.problem;
  const existing = listFolder(state.fs, dialog.folderId).find((node) => sameName(node.name, check.name));
  const windowId = window.id;
  const saved = (
    fs: FileSystem,
    nodeId: string,
    how: 'new' | 'update' | 'replace',
    nextId = state.nextId,
  ): Transition =>
    done(
      withApp({ ...state, fs, nextId }, window, markSaved(app, nodeId)),
      { type: 'file-saved', windowId, nodeId, folderId: dialog.folderId, kind: content.kind, how },
      { type: 'dialog-closed', windowId },
    );
  if (existing === undefined) {
    const nodeId = `n${state.nextId}`;
    const created = saveNewFile(state.fs, dialog.folderId, check.name, content, nodeId);
    if (!created.ok) return created.problem;
    return saved(created.fs, nodeId, 'new', state.nextId + 1);
  }
  if (!isFile(existing) || existing.kind !== content.kind) return 'duplicate';
  const isOwnFile = existing.id === app.fileId;
  if (!isOwnFile && dialog.replaceId !== existing.id) {
    const asking = { ...app, dialog: { ...dialog, replaceId: existing.id } };
    return done(withApp(state, window, asking), { type: 'replace-asked', windowId, nodeId: existing.id });
  }
  const written = overwriteFile(state.fs, existing.id, content);
  if (!written.ok) return written.problem;
  return saved(written.fs, existing.id, isOwnFile ? 'update' : 'replace');
}

function confirmOpen(state: DesktopState, window: WindowState, app: DocumentApp, dialog: FileDialog): Step {
  if (dialog.selectedId === null) return 'nothing-selected';
  const file = getNode(state.fs, dialog.selectedId);
  if (file === undefined) return 'not-found';
  if (!isFile(file) || file.kind !== FILE_FOR_APP[app.kind]) return 'not-a-file';
  const closed = done(withApp(state, window, { ...app, dialog: null }), { type: 'dialog-closed', windowId: window.id });
  const showing = state.windows.find((other) => 'fileId' in other.app && other.app.fileId === file.id);
  if (showing === undefined && isBlank(app)) {
    const loaded = withApp(closed.state, window, appForFile(file));
    return done(loaded, ...closed.events, ...openedEvents(window, file));
  }
  return then(closed, (current) => openFile(current, file.id));
}

function dialogAction(state: DesktopState, window: WindowState, action: DialogAction): Step {
  const { app } = window;
  if (!isDocumentApp(app) || app.dialog === null) return 'no-dialog';
  const dialog = app.dialog;
  const windowId = window.id;
  const update = (next: FileDialog, ...events: DesktopEvent[]): Transition =>
    done(withApp(state, window, { ...app, dialog: next }), ...events);
  const enter = (folderId: string): Step => {
    const folder = getNode(state.fs, folderId);
    if (folder === undefined) return 'not-found';
    if (!isFolder(folder)) return 'not-a-folder';
    if (folderId === TRASH_ID || isTrashed(state.fs, folderId)) return 'in-trash';
    return update(
      { ...dialog, folderId, selectedId: null, replaceId: null },
      { type: 'folder-opened', windowId, folderId },
    );
  };
  switch (action.type) {
    case 'open-folder':
      return enter(action.folderId);
    case 'go-up': {
      const parentId = getNode(state.fs, dialog.folderId)?.parentId ?? null;
      return dialog.folderId === HOME_ID || parentId === null ? done(state) : enter(parentId);
    }
    case 'select': {
      const node = getNode(state.fs, action.nodeId);
      if (node === undefined || node.parentId !== dialog.folderId) return 'not-found';
      if (isFolder(node)) return enter(node.id);
      // In a save dialog, picking a file of the same kind takes its name, ready to save over it.
      const takesName = dialog.mode === 'save-as' && node.kind === FILE_FOR_APP[app.kind];
      const name = takesName
        ? { ...createEditor({ text: node.name, maxLength: MAX_NAME_LENGTH }), anchor: 0 }
        : dialog.name;
      return update(
        { ...dialog, selectedId: node.id, name, replaceId: null },
        { type: 'selection-changed', windowId, nodeId: node.id },
      );
    }
    case 'confirm':
      return dialog.mode === 'save-as'
        ? confirmSave(state, window, app, dialog)
        : confirmOpen(state, window, app, dialog);
    // 'cancel', the last case.
    default:
      return done(withApp(state, window, { ...app, dialog: null }), { type: 'dialog-closed', windowId });
  }
}

// File explorer

function explorerOpen(state: DesktopState, window: WindowState, explorer: FileExplorerState, nodeId: string): Step {
  const node = getNode(state.fs, nodeId);
  if (node === undefined) return 'not-found';
  if (isFile(node)) return openFile(state, nodeId);
  if (nodeId !== TRASH_ID && isTrashed(state.fs, nodeId)) return 'in-trash';
  const opened: FileExplorerState = {
    ...explorer,
    folderId: nodeId,
    selectedId: null,
    rename: null,
    search: createEditor({ maxLength: MAX_NAME_LENGTH }),
  };
  return done(withApp(state, window, opened), { type: 'folder-opened', windowId: window.id, folderId: nodeId });
}

function startRename(state: DesktopState, window: WindowState, explorer: FileExplorerState, nodeId: string): Step {
  const node = getNode(state.fs, nodeId);
  if (node === undefined) return 'not-found';
  if (nodeId === HOME_ID || nodeId === TRASH_ID) return 'fixed-folder';
  if (isTrashed(state.fs, nodeId)) return 'in-trash';
  const field = { ...createEditor({ text: node.name, maxLength: MAX_NAME_LENGTH }), anchor: 0 };
  return done(withApp(state, window, { ...explorer, selectedId: nodeId, rename: { nodeId, field } }), {
    type: 'rename-started',
    windowId: window.id,
    nodeId,
  });
}

function explorerAction(state: DesktopState, window: WindowState, action: ExplorerAction): Step {
  const explorer = window.app;
  if (explorer.kind !== 'file-explorer') return 'wrong-app';
  const windowId = window.id;
  switch (action.type) {
    case 'open-node':
      return explorerOpen(state, window, explorer, action.nodeId);
    case 'select': {
      if (action.nodeId !== null && getNode(state.fs, action.nodeId) === undefined) return 'not-found';
      if (action.nodeId === explorer.selectedId) return done(state);
      // Picking something else leaves a rename unfinished, as Escape does.
      return done(withApp(state, window, { ...explorer, selectedId: action.nodeId, rename: null }), {
        type: 'selection-changed',
        windowId,
        nodeId: action.nodeId,
      });
    }
    case 'move': {
      const moved = moveNode(state.fs, action.nodeId, action.toId);
      if (!moved.ok) return moved.problem;
      if (!moved.changed) return done(state);
      const event: DesktopEvent =
        action.toId === TRASH_ID
          ? { type: 'node-trashed', nodeId: action.nodeId, fromId: moved.fromId }
          : { type: 'node-moved', nodeId: action.nodeId, fromId: moved.fromId, toId: action.toId };
      return done({ ...state, fs: moved.fs }, event);
    }
    case 'start-rename':
      return startRename(state, window, explorer, action.nodeId);
    case 'commit-rename': {
      if (explorer.rename === null) return 'no-text-field';
      const { nodeId, field } = explorer.rename;
      const renamed = renameNode(state.fs, nodeId, field.text);
      if (!renamed.ok) return renamed.problem;
      const next = withApp({ ...state, fs: renamed.fs }, window, { ...explorer, rename: null });
      if (renamed.from === renamed.node.name) return done(next);
      return done(next, { type: 'node-renamed', nodeId, from: renamed.from, to: renamed.node.name });
    }
    case 'cancel-rename':
      return done(withApp(state, window, { ...explorer, rename: null }));
    // 'clear-search', the last case.
    default: {
      if (explorer.search.text === '') return done(state);
      const search = createEditor({ maxLength: MAX_NAME_LENGTH });
      return done(withApp(state, window, { ...explorer, search }), {
        type: 'text-changed',
        windowId,
        field: 'search',
        text: '',
      });
    }
  }
}

function explorerCommand(
  state: DesktopState,
  window: WindowState,
  explorer: FileExplorerState,
  command: CommandId,
): Step {
  const selectedId = explorer.selectedId;
  switch (command) {
    case 'open':
      return selectedId === null ? 'nothing-selected' : explorerOpen(state, window, explorer, selectedId);
    case 'new-folder': {
      const nodeId = `n${state.nextId}`;
      const created = createUntitledFolder(state.fs, explorer.folderId, NEW_FOLDER_NAME, nodeId);
      if (!created.ok) return created.problem;
      const next = { ...state, fs: created.fs, nextId: state.nextId + 1 };
      const made = done(next, { type: 'folder-created', nodeId, parentId: explorer.folderId, name: created.node.name });
      return then(made, (current) => startRename(current, window, explorer, nodeId));
    }
    case 'rename':
      return selectedId === null ? 'nothing-selected' : startRename(state, window, explorer, selectedId);
    case 'delete': {
      if (selectedId === null) return 'nothing-selected';
      const trashed = trashNode(state.fs, selectedId);
      if (!trashed.ok) return trashed.problem;
      return done(withApp({ ...state, fs: trashed.fs }, window, { ...explorer, selectedId: null }), {
        type: 'node-trashed',
        nodeId: selectedId,
        fromId: trashed.fromId,
      });
    }
    case 'restore': {
      if (selectedId === null) return 'nothing-selected';
      const restored = restoreNode(state.fs, selectedId);
      if (!restored.ok) return restored.problem;
      return done(withApp({ ...state, fs: restored.fs }, window, { ...explorer, selectedId: null }), {
        type: 'node-restored',
        nodeId: selectedId,
        toId: restored.toId,
        renamedTo: restored.renamed ? restored.node.name : null,
      });
    }
    case 'empty-trash': {
      const emptied = emptyTrash(state.fs);
      return done({ ...state, fs: emptied.fs }, { type: 'trash-emptied', nodeIds: emptied.removedIds });
    }
    case 'go-up': {
      const parentId = getNode(state.fs, explorer.folderId)?.parentId ?? HOME_ID;
      return explorerOpen(state, window, explorer, parentId);
    }
    default:
      return 'command-disabled';
  }
}

// Commands

const TEXT_COMMANDS: Readonly<Partial<Record<CommandId, TextOp>>> = {
  undo: { type: 'undo' },
  redo: { type: 'redo' },
  cut: { type: 'cut' },
  copy: { type: 'copy' },
  paste: { type: 'paste' },
  'select-all': { type: 'select-all' },
};

function stepPicture(state: DesktopState, window: WindowState, direction: 1 | -1): Step {
  const { app } = window;
  if (app.kind !== 'picture-viewer' || app.fileId === null) return 'command-disabled';
  const file = getNode(state.fs, app.fileId);
  if (file?.parentId == null) return 'not-found';
  const pictures = filesOfKind(state.fs, file.parentId, 'picture');
  const index = pictures.findIndex((picture) => picture.id === file.id);
  const next = pictures[(index + direction + pictures.length) % pictures.length];
  if (next === undefined) return 'not-found';
  return done(withApp(state, window, { ...app, fileId: next.id }), {
    type: 'picture-shown',
    windowId: window.id,
    nodeId: next.id,
  });
}

function runCommand(state: DesktopState, window: WindowState, command: CommandId, env: DesktopEnv): Step {
  const { app } = window;
  const windowId = window.id;
  if (command === 'close') return closeWindow(state, window);
  const field = activeField(app);
  const textOp = TEXT_COMMANDS[command];
  if (textOp !== undefined && field !== null) return editField(state, window, field, textOp, env);
  if (app.kind === 'file-explorer') return explorerCommand(state, window, app, command);
  if (app.kind === 'calculator') {
    if (command === 'copy') {
      const text = copyableNumber(app);
      if (text === null) return 'command-disabled';
      env.clipboard.write({ kind: 'text', text });
      return done(state, { type: 'copied', windowId, text });
    }
    if (command === 'paste') {
      const text = env.clipboard.read()?.text ?? '';
      const pasted = pasteNumber(app, text);
      if (pasted === null) return 'not-a-number';
      return done(
        withApp(state, window, pasted),
        { type: 'pasted', windowId, text },
        { type: 'calculator-changed', windowId, display: pasted.display, problem: null },
      );
    }
    return calculatorKey(state, window, { type: 'clear' });
  }
  if (
    app.kind === 'music-box' &&
    command !== 'new' &&
    command !== 'open' &&
    command !== 'save' &&
    command !== 'save-as'
  ) {
    return musicCommand(state, window, command);
  }
  if (app.kind === 'picture-viewer' && (command === 'previous' || command === 'next')) {
    return stepPicture(state, window, command === 'next' ? 1 : -1);
  }
  if (!isDocumentApp(app)) return 'command-disabled';
  switch (command) {
    case 'new':
      return openWindow(state, createApp(app.kind, state));
    case 'open':
      return openDialog(state, window, app, 'open');
    case 'save':
      return saveDocument(state, window, app);
    case 'save-as':
      return openDialog(state, window, app, 'save-as');
    default:
      return 'command-disabled';
  }
}

function musicCommand(state: DesktopState, window: WindowState, command: CommandId): Step {
  const app = window.app;
  if (app.kind !== 'music-box') return 'wrong-app';
  const windowId = window.id;
  const withGrid = (grid: ReturnType<typeof createGrid>) => withApp(state, window, { ...app, ...grid });
  switch (command) {
    case 'undo':
      return done(withGrid(undoGrid(app)), { type: 'undone', windowId });
    case 'redo':
      return done(withGrid(redoGrid(app)), { type: 'redone', windowId });
    case 'clear':
      return done(withGrid(clearGrid(app)), { type: 'tune-cleared', windowId });
    case 'play': {
      const started = play(app);
      return done(
        withGrid(started.grid),
        { type: 'playback-changed', windowId, playing: true },
        { type: 'step-played', windowId, step: 0, notes: started.notes },
      );
    }
    case 'stop':
      return done(withGrid(stop(app)), { type: 'playback-changed', windowId, playing: false });
    default:
      return 'command-disabled';
  }
}

function musicAction(state: DesktopState, window: WindowState, action: MusicBoxAction): Step {
  const app = window.app;
  if (app.kind !== 'music-box') return 'wrong-app';
  const windowId = window.id;
  if (action.type === 'tick') {
    const ticked = tick(app);
    if (ticked === null) return done(state);
    return done(withApp(state, window, { ...app, ...ticked.grid }), {
      type: 'step-played',
      windowId,
      step: ticked.grid.position,
      notes: ticked.notes,
    });
  }
  const grid = toggleCell(app, action.step, action.note);
  if (grid === app) return 'not-an-option';
  const on = grid.tune.steps[action.step]?.[action.note] ?? false;
  return done(withApp(state, window, { ...app, ...grid }), {
    type: 'note-toggled',
    windowId,
    step: action.step,
    note: action.note,
    on,
  });
}

function calculatorKey(state: DesktopState, window: WindowState, key: CalculatorKey): Step {
  const app = window.app;
  if (app.kind !== 'calculator') return 'wrong-app';
  const next = pressKey(app, key);
  if (next === app) return done(state);
  const changed = next.display !== app.display || next.problem !== app.problem;
  const events: DesktopEvent[] = changed
    ? [{ type: 'calculator-changed', windowId: window.id, display: next.display, problem: next.problem }]
    : [];
  return done(withApp(state, window, next), ...events);
}

function settingsAction(state: DesktopState, window: WindowState, action: SettingsAction): Step {
  const app = window.app;
  if (app.kind !== 'settings') return 'wrong-app';
  const result = applySettingsAction(state.settings, app, action);
  if (typeof result === 'string') return result;
  const next = withApp({ ...state, settings: result.settings }, window, result.panel);
  return result.changed === null ? done(next) : done(next, { type: 'setting-changed', ...result.changed });
}

/**
 * Keeps windows pointing at things that still exist after the file system changed: an explorer
 * or dialog whose folder went away or into the trash goes home, and a selection of a removed
 * item clears.
 */
export function repairWindows(state: DesktopState): DesktopState {
  const { fs } = state;
  const exists = (id: string | null) => id !== null && getNode(fs, id) !== undefined;
  const usableFolder = (id: string, allowTrash: boolean) =>
    isFolder(getNode(fs, id)) && (id === TRASH_ID ? allowTrash : !isTrashed(fs, id));
  const windows = state.windows.map((window): WindowState => {
    const { app } = window;
    if (app.kind === 'file-explorer') {
      const folderId = usableFolder(app.folderId, true) ? app.folderId : HOME_ID;
      const selectedId = exists(app.selectedId) ? app.selectedId : null;
      const rename =
        app.rename !== null && exists(app.rename.nodeId) && !isTrashed(fs, app.rename.nodeId) ? app.rename : null;
      if (folderId === app.folderId && selectedId === app.selectedId && rename === app.rename) return window;
      return { ...window, app: { ...app, folderId, selectedId, rename } };
    }
    if (isDocumentApp(app) && app.dialog !== null) {
      const { dialog } = app;
      const folderId = usableFolder(dialog.folderId, false) ? dialog.folderId : HOME_ID;
      const selectedId = exists(dialog.selectedId) && folderId === dialog.folderId ? dialog.selectedId : null;
      const replaceId = exists(dialog.replaceId) ? dialog.replaceId : null;
      if (folderId === dialog.folderId && selectedId === dialog.selectedId && replaceId === dialog.replaceId)
        return window;
      return { ...window, app: { ...app, dialog: { ...dialog, folderId, selectedId, replaceId } } };
    }
    return window;
  });
  return windows.every((window, index) => window === state.windows[index]) ? state : { ...state, windows };
}

function handle(state: DesktopState, action: DesktopAction, env: DesktopEnv): Step {
  switch (action.type) {
    case 'open-app':
      return openWindow(state, createApp(action.app, state));
    case 'open-file':
      return openFile(state, action.fileId);
    case 'focus-next-window': {
      const back = state.windows[0];
      if (back === undefined || (state.windows.length === 1 && !back.minimized)) return done(state);
      return activate(state, back);
    }
    case 'set-desktop-size':
      return setDesktopSize(state, action.width, action.height);
    case 'set-volume':
      return setVolume(state, action.volume);
    case 'set-muted':
      return setMuted(state, action.muted);
    default:
      break;
  }
  const window = findWindow(state, action.windowId);
  if (window === undefined) return 'no-window';
  switch (action.type) {
    case 'close-window':
      return closeWindow(state, window);
    case 'focus-window':
      return window.minimized ? 'minimized' : bringToFront(state, window.id);
    case 'move-window':
      return moveWindow(state, window, action.x, action.y);
    case 'resize-window':
      return resizeWindow(state, window, action.width, action.height);
    case 'minimize-window':
      return minimizeWindow(state, window);
    case 'maximize-window':
      return maximizeWindow(state, window);
    case 'unmaximize-window':
      return unmaximizeWindow(state, window);
    case 'activate-window':
      return activate(state, window);
    case 'command': {
      if (!isCommandEnabled(state, window.id, action.command, env.clipboard)) return 'command-disabled';
      const ran = runCommand(state, window, action.command, env);
      if (typeof ran === 'string') return ran;
      const run: DesktopEvent = {
        type: 'command-run',
        windowId: window.id,
        app: window.app.kind,
        command: action.command,
      };
      return {
        state: { ...ran.state, lastCommand: { command: action.command, app: window.app.kind } },
        events: [run, ...ran.events],
      };
    }
    case 'text':
      return editField(state, window, action.field, action.op, env);
    case 'dialog':
      return dialogAction(state, window, action.action);
    case 'explorer':
      return explorerAction(state, window, action.action);
    case 'music-box':
      return musicAction(state, window, action.action);
    case 'calculator':
      return calculatorKey(state, window, action.key);
    // 'settings', the last case.
    default:
      return settingsAction(state, window, action.action);
  }
}

/**
 * Applies one action. A refused action returns the same state and one `rejected` event with
 * the reason, so a screen can say something gentle and the child carries on.
 */
export function reduce(state: DesktopState, action: DesktopAction, env: DesktopEnv): Transition {
  const result = handle(state, action, env);
  if (typeof result === 'string') return { state, events: [{ type: 'rejected', action: action.type, reason: result }] };
  const repaired = result.state.fs === state.fs ? result.state : repairWindows(result.state);
  return { state: repaired, events: result.events };
}

/** Applies actions in order and collects every event. Handy for lessons and tests. */
export function reduceAll(state: DesktopState, actions: readonly DesktopAction[], env: DesktopEnv): Transition {
  return actions.reduce<Transition>(
    (acc, action) => {
      const next = reduce(acc.state, action, env);
      return { state: next.state, events: [...acc.events, ...next.events] };
    },
    { state, events: [] },
  );
}
