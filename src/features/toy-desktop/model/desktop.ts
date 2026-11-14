/**
 * The toy desktop reducer: `reduce(state, action, env)` returns the next state and the events
 * that happened. It is pure apart from the injected clipboard, which copy and cut write and
 * paste reads. Writing the same content twice is harmless, so calling it twice for one action
 * is safe.
 */
import {
  copyableNumber,
  createCalculator,
  pasteNumber,
  pressKey,
  type CalculatorKey,
  type CalculatorState,
} from './apps/calculator.ts';
import { clearGrid, createGrid, play, redoGrid, stop, tick, toggleCell, undoGrid } from './apps/musicBox.ts';
import { applySettingsAction, createSettingsPanel, type SettingsAction } from './apps/settingsPanel.ts';
import { emptyTune, isEmptyTune } from './apps/tune.ts';
import { appHasCommand } from './appMenus.ts';
import type { CommandId } from './commands.ts';
import type { DesktopEvent, RejectReason } from './events.ts';
import { activeField, fieldAccess, type TextFieldId } from './fields.ts';
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
  sameRect,
  type Rect,
  type Size,
} from './geometry.ts';
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
  type MusicBoxState,
  type NotepadState,
  type PictureViewerState,
  type WindowState,
} from './state.ts';
import {
  applyTextOp,
  canRedo,
  canUndo,
  createEditor,
  hasSelection,
  type TextClipboard,
  type TextCommandOp,
  type TextEditOp,
  type TextEditorState,
  type TextOp,
} from './textEditor.ts';

export interface DesktopEnv {
  /** The app's `toyClipboard`, or `createToyClipboard()` in a test. */
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
  /**
   * Opens an app in a new window. `size` replaces the app's usual size, such as a size that suits
   * the screen; it is clamped to the desktop. With `maximized`, the new window opens filling the
   * desktop, in the same transition, so a lesson sees one action and not an open and a maximize.
   */
  | { type: 'open-app'; app: AppKind; size?: Size; maximized?: boolean }
  /** Opens a file in its app, or brings forward the window that already shows it. `size` and `maximized` as for open-app. */
  | { type: 'open-file'; fileId: string; size?: Size; maximized?: boolean }
  /** Opens a folder or the trash in a new file explorer. `size` and `maximized` as for open-app. */
  | { type: 'open-folder'; folderId: string; size?: Size; maximized?: boolean }
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
  /** A menu command or its shortcut. A command that cannot run now is refused; see `isCommandEnabled`. */
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

const noteEditor = (text = '') => createEditor({ text, multiline: true, maxLength: MAX_NOTE_LENGTH });
const nameEditor = (text = '') => createEditor({ text, maxLength: MAX_NAME_LENGTH });

/** A name field with the whole name selected, so typing replaces it. */
const selectedName = (text: string): TextEditorState => ({ ...nameEditor(text), anchor: 0 });

function createExplorer(): FileExplorerState {
  return { kind: 'file-explorer', folderId: HOME_ID, selectedId: null, search: nameEditor(), rename: null };
}

/** A fresh app of a kind, with nothing open. */
function createApp(kind: AppKind, state: DesktopState): AppState {
  switch (kind) {
    case 'notepad':
      return { kind, fileId: null, editor: noteEditor(), savedText: '', dialog: null };
    case 'picture-viewer':
      return { kind, fileId: null, dialog: null };
    case 'file-explorer':
      return createExplorer();
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
      const editor = noteEditor(file.text);
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
  const query = explorer.search.text.trim();
  return query === '' ? listFolder(fs, explorer.folderId) : searchByName(fs, query);
}

function replaceWindow(state: DesktopState, window: WindowState): DesktopState {
  return { ...state, windows: state.windows.map((other) => (other.id === window.id ? window : other)) };
}

function withApp(state: DesktopState, window: WindowState, app: AppState): DesktopState {
  return replaceWindow(state, { ...window, app });
}

/** Brings a window to the front and focuses it. Pass the window as it is in `state`. */
function bringToFront(state: DesktopState, window: WindowState): Transition {
  const windows = [...state.windows.filter((other) => other.id !== window.id), window];
  const next = { ...state, windows, focusedWindowId: window.id };
  return state.focusedWindowId === window.id ? done(next) : done(next, { type: 'window-focused', windowId: window.id });
}

/**
 * Gives focus to the front window that is not minimized, after one closed or minimized. Focus
 * always sits on that window, so this changes nothing when another window had it.
 */
function refocus(state: DesktopState): Transition {
  const front = topVisibleWindow(state);
  return front === undefined ? done({ ...state, focusedWindowId: null }) : bringToFront(state, front);
}

function openWindow(state: DesktopState, app: AppState, size?: Size, maximized = false): Step {
  if (size !== undefined && !(Number.isFinite(size.width) && Number.isFinite(size.height))) return 'not-an-option';
  if (state.windows.length >= MAX_WINDOWS) return 'too-many-windows';
  const windowId = `w${state.nextWindowId}`;
  const rect = cascadeRect(
    size ?? DEFAULT_WINDOW_SIZES[app.kind],
    state.size,
    state.windows.map((window) => window.rect),
  );
  const window: WindowState = { id: windowId, rect, minimized: false, maximized, app };
  const next = {
    ...state,
    nextWindowId: state.nextWindowId + 1,
    windows: [...state.windows, window],
    focusedWindowId: windowId,
  };
  return done(next, { type: 'window-opened', windowId, app: app.kind }, { type: 'window-focused', windowId });
}

function activate(state: DesktopState, window: WindowState): Transition {
  if (!window.minimized) return bringToFront(state, window);
  const restored = { ...window, minimized: false };
  const front = bringToFront(replaceWindow(state, restored), restored);
  return { state: front.state, events: [{ type: 'window-restored', windowId: window.id }, ...front.events] };
}

function openedEvents(windowId: string, file: FileNode): DesktopEvent[] {
  const opened: DesktopEvent = { type: 'file-opened', windowId, nodeId: file.id };
  return file.kind === 'picture' ? [opened, { type: 'picture-shown', windowId, nodeId: file.id }] : [opened];
}

function openFile(state: DesktopState, fileId: string, size?: Size, maximized = false): Step {
  const file = getNode(state.fs, fileId);
  if (file === undefined) return 'not-found';
  if (!isFile(file)) return 'not-a-file';
  if (isTrashed(state.fs, fileId)) return 'in-trash';
  const showing = state.windows.find((window) => 'fileId' in window.app && window.app.fileId === fileId);
  if (showing !== undefined) return activate(state, showing);
  const opened = openWindow(state, appForFile(file), size, maximized);
  if (typeof opened === 'string') return opened;
  return { ...opened, events: [...opened.events, ...openedEvents(`w${state.nextWindowId}`, file)] };
}

function openFolder(state: DesktopState, folderId: string, size?: Size, maximized = false): Step {
  const folder = getNode(state.fs, folderId);
  if (folder === undefined) return 'not-found';
  if (!isFolder(folder)) return 'not-a-folder';
  if (isTrashed(state.fs, folderId)) return 'in-trash';
  const explorer: FileExplorerState = { ...createExplorer(), folderId };
  const opened = openWindow(state, explorer, size, maximized);
  if (typeof opened === 'string') return opened;
  const windowId = `w${state.nextWindowId}`;
  return folderId === HOME_ID
    ? opened
    : { ...opened, events: [...opened.events, { type: 'folder-opened', windowId, folderId }] };
}

function closeWindow(state: DesktopState, window: WindowState): Transition {
  const closed: DesktopEvent = {
    type: 'window-closed',
    windowId: window.id,
    app: window.app.kind,
    unsavedChanges: hasUnsavedChanges(window.app),
  };
  const refocused = refocus({ ...state, windows: state.windows.filter((other) => other.id !== window.id) });
  return { state: refocused.state, events: [closed, ...refocused.events] };
}

function moveWindow(state: DesktopState, window: WindowState, x: number, y: number): Step {
  if (window.minimized) return 'minimized';
  const rect = clampWindowPosition({ ...window.rect, x, y }, state.size);
  const events: DesktopEvent[] = [];
  if (window.maximized) events.push({ type: 'window-unmaximized', windowId: window.id });
  if (!sameRect(rect, window.rect)) events.push({ type: 'window-moved', windowId: window.id, rect });
  const moved = { ...window, rect, maximized: false };
  const front = bringToFront(replaceWindow(state, moved), moved);
  return { state: front.state, events: [...events, ...front.events] };
}

function resizeWindow(state: DesktopState, window: WindowState, width: number, height: number): Step {
  if (window.minimized) return 'minimized';
  if (window.maximized) return 'maximized';
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'not-an-option';
  const size = clampWindowSize({ width, height }, state.size);
  const clamped = size.width !== Math.round(width) || size.height !== Math.round(height);
  const rect = clampWindowPosition({ ...window.rect, ...size }, state.size);
  const resized = { ...window, rect };
  const front = bringToFront(replaceWindow(state, resized), resized);
  const events: DesktopEvent[] =
    clamped || !sameRect(rect, window.rect) ? [{ type: 'window-resized', windowId: window.id, rect, clamped }] : [];
  return { state: front.state, events: [...events, ...front.events] };
}

function minimizeWindow(state: DesktopState, window: WindowState): Transition {
  if (window.minimized) return done(state);
  const refocused = refocus(replaceWindow(state, { ...window, minimized: true }));
  return { state: refocused.state, events: [{ type: 'window-minimized', windowId: window.id }, ...refocused.events] };
}

function maximizeWindow(state: DesktopState, window: WindowState): Transition {
  const events: DesktopEvent[] = [];
  if (window.minimized) events.push({ type: 'window-restored', windowId: window.id });
  if (!window.maximized) events.push({ type: 'window-maximized', windowId: window.id });
  const maximized = { ...window, maximized: true, minimized: false };
  const front = bringToFront(replaceWindow(state, maximized), maximized);
  return { state: front.state, events: [...events, ...front.events] };
}

function unmaximizeWindow(state: DesktopState, window: WindowState): Step {
  // The restore button is in the title bar, which a minimized window does not show. Focusing a
  // minimized window would put focus on a window the child cannot see.
  if (window.minimized) return 'minimized';
  if (!window.maximized) return done(state);
  const restored = { ...window, maximized: false };
  const front = bringToFront(replaceWindow(state, restored), restored);
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
  const access = fieldAccess(window.app, field);
  if (access === undefined) return 'no-text-field';
  const result = applyTextOp(access.editor, op, env.clipboard);
  let next = withApp(state, window, access.set(result.editor));
  const events: DesktopEvent[] = [];
  const windowId = window.id;
  if (result.copied !== undefined)
    events.push({ type: op.type === 'cut' ? 'cut' : 'copied', windowId, text: result.copied });
  if (result.changed) {
    if (result.pasted !== undefined) events.push({ type: 'pasted', windowId, text: result.pasted });
    if (op.type === 'undo') events.push({ type: 'undone', windowId });
    if (op.type === 'redo') events.push({ type: 'redone', windowId });
    events.push({ type: 'text-changed', windowId, field, text: result.editor.text });
    if (field === 'computer-name') {
      next = { ...next, settings: { ...next.settings, computerName: result.editor.text } };
      events.push({ type: 'setting-changed', setting: 'computerName', value: result.editor.text });
    }
  }
  return done(next, ...events);
}

/** When each edit command can run on a field. */
const TEXT_COMMAND_ALLOWED: Readonly<
  Record<TextCommandOp['type'], (editor: TextEditorState, clipboard: TextClipboard) => boolean>
> = {
  undo: canUndo,
  redo: canRedo,
  cut: hasSelection,
  copy: hasSelection,
  paste: (_editor, clipboard) => (clipboard.read()?.text ?? '') !== '',
  'select-all': (editor) => editor.text !== '',
};

function textCommand(
  state: DesktopState,
  window: WindowState,
  field: TextFieldId,
  op: TextCommandOp,
  env: DesktopEnv,
): Step {
  const access = fieldAccess(window.app, field);
  if (access === undefined || !TEXT_COMMAND_ALLOWED[op.type](access.editor, env.clipboard)) return 'command-disabled';
  return editField(state, window, field, op, env);
}

// Documents: the notepad, the picture viewer, and the music box

type DocumentApp = NotepadState | PictureViewerState | MusicBoxState;
/** The apps that save what they hold. */
type SavableApp = NotepadState | MusicBoxState;

function isDocumentApp(app: AppState): app is DocumentApp {
  return 'dialog' in app;
}

function documentContent(app: SavableApp): FileContent {
  return app.kind === 'notepad' ? { kind: 'note', text: app.editor.text } : { kind: 'tune', tune: app.tune };
}

function markSaved(app: SavableApp, fileId: string): SavableApp {
  return app.kind === 'notepad'
    ? { ...app, fileId, savedText: app.editor.text, dialog: null }
    : { ...app, fileId, savedTune: app.tune, dialog: null };
}

/** A document window that shows nothing yet, where an opened file can load in place. */
function isBlank(app: DocumentApp): boolean {
  if (app.fileId !== null) return false;
  if (app.kind === 'notepad') return app.editor.text === '';
  return app.kind === 'picture-viewer' || isEmptyTune(app.tune);
}

/** The folder a dialog starts in: the folder of the open file, or home. */
function startFolder(fs: FileSystem, app: DocumentApp): string {
  const file = getNode(fs, app.fileId);
  return file === undefined || isTrashed(fs, file.id) ? HOME_ID : (file.parentId ?? HOME_ID);
}

function openDialog(state: DesktopState, window: WindowState, app: DocumentApp, mode: FileDialog['mode']): Transition {
  const dialog: FileDialog = {
    mode,
    folderId: startFolder(state.fs, app),
    selectedId: null,
    name: selectedName(getNode(state.fs, app.fileId)?.name ?? ''),
    replaceId: null,
  };
  return done(withApp(state, window, { ...app, dialog }), { type: 'dialog-opened', windowId: window.id, mode });
}

function saveDocument(state: DesktopState, window: WindowState, app: SavableApp): Step {
  if (app.fileId !== null && !hasUnsavedChanges(app)) return 'command-disabled';
  const content = documentContent(app);
  const saved = overwriteFile(state.fs, app.fileId ?? '', content);
  // A note never saved, or whose file is gone or in the trash, needs a name and a place.
  if (!saved.ok) return openDialog(state, window, app, 'save-as');
  const next = withApp({ ...state, fs: saved.fs }, window, markSaved(app, saved.node.id));
  return done(next, {
    type: 'file-saved',
    windowId: window.id,
    nodeId: saved.node.id,
    folderId: saved.node.parentId ?? HOME_ID,
    kind: content.kind,
    how: 'update',
  });
}

function confirmSave(state: DesktopState, window: WindowState, app: SavableApp, dialog: FileDialog): Step {
  const content = documentContent(app);
  const check = checkName(dialog.name.text, []);
  if (!check.ok) return check.problem;
  const existing = listFolder(state.fs, dialog.folderId).find((node) => sameName(node.name, check.name));
  const windowId = window.id;
  const saved = (fs: FileSystem, nodeId: string, how: 'new' | 'update' | 'replace', nextId: number): Transition =>
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
  if (existing.kind !== content.kind) return 'duplicate';
  const isOwnFile = existing.id === app.fileId;
  if (!isOwnFile && dialog.replaceId !== existing.id) {
    const asking = { ...app, dialog: { ...dialog, replaceId: existing.id } };
    return done(withApp(state, window, asking), { type: 'replace-asked', windowId, nodeId: existing.id });
  }
  const written = overwriteFile(state.fs, existing.id, content);
  if (!written.ok) return written.problem;
  return saved(written.fs, existing.id, isOwnFile ? 'update' : 'replace', state.nextId);
}

function confirmOpen(state: DesktopState, window: WindowState, app: DocumentApp, dialog: FileDialog): Step {
  if (dialog.selectedId === null) return 'nothing-selected';
  const file = getNode(state.fs, dialog.selectedId);
  if (!isFile(file) || file.kind !== FILE_FOR_APP[app.kind]) return 'not-a-file';
  const closed = done(withApp(state, window, { ...app, dialog: null }), { type: 'dialog-closed', windowId: window.id });
  const showing = state.windows.some((other) => 'fileId' in other.app && other.app.fileId === file.id);
  if (!showing && isBlank(app)) {
    const loaded = withApp(closed.state, window, appForFile(file));
    return done(loaded, ...closed.events, ...openedEvents(window.id, file));
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
      // A dialog is never in the trash, so every folder in it but home has a parent.
      const parentId = getNode(state.fs, dialog.folderId)?.parentId ?? null;
      return parentId === null ? done(state) : enter(parentId);
    }
    case 'select': {
      const node = getNode(state.fs, action.nodeId);
      if (node?.parentId !== dialog.folderId) return 'not-found';
      if (isFolder(node)) return enter(node.id);
      // Picking a file of this app's kind takes its name, ready to save over it.
      const name = node.kind === FILE_FOR_APP[app.kind] ? selectedName(node.name) : dialog.name;
      return update(
        { ...dialog, selectedId: node.id, name, replaceId: null },
        { type: 'selection-changed', windowId, nodeId: node.id },
      );
    }
    case 'confirm':
      if (dialog.mode === 'open') return confirmOpen(state, window, app, dialog);
      // The picture viewer has no save command, so only a notepad or music box gets here.
      return app.kind === 'picture-viewer' ? 'no-dialog' : confirmSave(state, window, app, dialog);
    // 'cancel', the last case.
    default:
      return done(withApp(state, window, { ...app, dialog: null }), { type: 'dialog-closed', windowId });
  }
}

/** New, open, save, and save as, which the notepad and the music box share. Null for any other command. */
function documentCommand(state: DesktopState, window: WindowState, app: SavableApp, command: CommandId): Step | null {
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
      return null;
  }
}

// The picture viewer

function stepPicture(state: DesktopState, window: WindowState, app: PictureViewerState, direction: 1 | -1): Step {
  const file = getNode(state.fs, app.fileId);
  if (!isFile(file) || isTrashed(state.fs, file.id)) return 'command-disabled';
  const pictures = filesOfKind(state.fs, file.parentId ?? HOME_ID, 'picture');
  if (pictures.length < 2) return 'command-disabled';
  const index = pictures.findIndex((picture) => picture.id === file.id);
  const next = pictures[(index + direction + pictures.length) % pictures.length] ?? file;
  return done(withApp(state, window, { ...app, fileId: next.id }), {
    type: 'picture-shown',
    windowId: window.id,
    nodeId: next.id,
  });
}

function viewerCommand(state: DesktopState, window: WindowState, app: PictureViewerState, command: CommandId): Step {
  if (command === 'open') return openDialog(state, window, app, 'open');
  return stepPicture(state, window, app, command === 'next' ? 1 : -1);
}

// File explorer

function explorerOpen(state: DesktopState, window: WindowState, explorer: FileExplorerState, nodeId: string): Step {
  const node = getNode(state.fs, nodeId);
  if (node === undefined) return 'not-found';
  if (isFile(node)) return openFile(state, nodeId);
  if (isTrashed(state.fs, nodeId)) return 'in-trash';
  const opened: FileExplorerState = {
    ...explorer,
    folderId: nodeId,
    selectedId: null,
    rename: null,
    search: nameEditor(),
  };
  return done(withApp(state, window, opened), { type: 'folder-opened', windowId: window.id, folderId: nodeId });
}

function startRename(state: DesktopState, window: WindowState, explorer: FileExplorerState, nodeId: string): Step {
  const node = getNode(state.fs, nodeId);
  if (node === undefined) return 'not-found';
  if (node.parentId === null) return 'fixed-folder';
  if (isTrashed(state.fs, nodeId)) return 'in-trash';
  return done(
    withApp(state, window, { ...explorer, selectedId: nodeId, rename: { nodeId, field: selectedName(node.name) } }),
    {
      type: 'rename-started',
      windowId: window.id,
      nodeId,
    },
  );
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
      return done(withApp(state, window, { ...explorer, search: nameEditor() }), {
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
  const { selectedId, rename } = explorer;
  const selected = getNode(state.fs, selectedId);
  switch (command) {
    case 'open':
      return selected === undefined ? 'command-disabled' : explorerOpen(state, window, explorer, selected.id);
    case 'new-folder': {
      if (rename !== null || explorer.folderId === TRASH_ID) return 'command-disabled';
      const nodeId = `n${state.nextId}`;
      const created = createUntitledFolder(state.fs, explorer.folderId, NEW_FOLDER_NAME, nodeId);
      if (!created.ok) return created.problem;
      const next = { ...state, fs: created.fs, nextId: state.nextId + 1 };
      const made = done(next, { type: 'folder-created', nodeId, parentId: explorer.folderId, name: created.node.name });
      return then(made, (current) => startRename(current, window, explorer, nodeId));
    }
    case 'rename':
      return rename !== null || selected === undefined
        ? 'command-disabled'
        : startRename(state, window, explorer, selected.id);
    case 'delete': {
      if (rename !== null || selected === undefined) return 'command-disabled';
      const trashed = trashNode(state.fs, selected.id);
      if (!trashed.ok) return trashed.problem;
      return done(withApp({ ...state, fs: trashed.fs }, window, { ...explorer, selectedId: null }), {
        type: 'node-trashed',
        nodeId: selected.id,
        fromId: trashed.fromId,
      });
    }
    case 'restore': {
      const restored = restoreNode(state.fs, selected?.id ?? '');
      if (!restored.ok) return restored.problem;
      return done(withApp({ ...state, fs: restored.fs }, window, { ...explorer, selectedId: null }), {
        type: 'node-restored',
        nodeId: restored.node.id,
        toId: restored.toId,
        renamedTo: restored.renamed ? restored.node.name : null,
      });
    }
    case 'empty-trash': {
      const emptied = emptyTrash(state.fs);
      if (emptied.removedIds.length === 0) return 'command-disabled';
      return done({ ...state, fs: emptied.fs }, { type: 'trash-emptied', nodeIds: emptied.removedIds });
    }
    // 'go-up', the last command in the explorer's menus.
    default: {
      if (explorer.folderId === HOME_ID) return 'command-disabled';
      // The trash has no parent, so going up from it goes home.
      const parentId = getNode(state.fs, explorer.folderId)?.parentId ?? HOME_ID;
      return explorerOpen(state, window, explorer, parentId);
    }
  }
}

// The music box

function musicCommand(state: DesktopState, window: WindowState, app: MusicBoxState, command: CommandId): Step {
  const document = documentCommand(state, window, app, command);
  if (document !== null) return document;
  const windowId = window.id;
  const withGrid = (grid: ReturnType<typeof createGrid>) => withApp(state, window, { ...app, ...grid });
  switch (command) {
    case 'undo':
      return app.undo.length === 0 ? 'command-disabled' : done(withGrid(undoGrid(app)), { type: 'undone', windowId });
    case 'redo':
      return app.redo.length === 0 ? 'command-disabled' : done(withGrid(redoGrid(app)), { type: 'redone', windowId });
    case 'clear':
      return isEmptyTune(app.tune)
        ? 'command-disabled'
        : done(withGrid(clearGrid(app)), { type: 'tune-cleared', windowId });
    case 'play': {
      if (app.playing) return 'command-disabled';
      const started = play(app);
      return done(
        withGrid(started.grid),
        { type: 'playback-changed', windowId, playing: true },
        { type: 'step-played', windowId, step: 0, notes: started.notes },
      );
    }
    // 'stop', the last command in the music box's menus.
    default:
      return app.playing
        ? done(withGrid(stop(app)), { type: 'playback-changed', windowId, playing: false })
        : 'command-disabled';
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
  const on = grid.tune.steps[action.step]?.[action.note] === true;
  return done(withApp(state, window, { ...app, ...grid }), {
    type: 'note-toggled',
    windowId,
    step: action.step,
    note: action.note,
    on,
  });
}

// The calculator and the settings panel

function calculatorKey(state: DesktopState, window: WindowState, key: CalculatorKey): Step {
  const app = window.app;
  if (app.kind !== 'calculator') return 'wrong-app';
  const next = pressKey(app, key);
  if (next === app) return done(state);
  return done(withApp(state, window, next), {
    type: 'calculator-changed',
    windowId: window.id,
    display: next.display,
    problem: next.problem,
  });
}

function calculatorCommand(
  state: DesktopState,
  window: WindowState,
  app: CalculatorState,
  command: CommandId,
  env: DesktopEnv,
): Step {
  const windowId = window.id;
  switch (command) {
    case 'copy': {
      const text = copyableNumber(app);
      if (text === null) return 'command-disabled';
      env.clipboard.write({ kind: 'text', text });
      return done(state, { type: 'copied', windowId, text });
    }
    case 'paste': {
      const text = env.clipboard.read()?.text ?? '';
      const pasted = pasteNumber(app, text);
      if (pasted === null) return 'not-a-number';
      return done(
        withApp(state, window, pasted),
        { type: 'pasted', windowId, text },
        { type: 'calculator-changed', windowId, display: pasted.display, problem: null },
      );
    }
    // 'clear', the last command in the calculator's menus.
    default:
      return done(withApp(state, window, createCalculator()), {
        type: 'calculator-changed',
        windowId,
        display: '0',
        problem: null,
      });
  }
}

function settingsAction(state: DesktopState, window: WindowState, action: SettingsAction): Step {
  const app = window.app;
  if (app.kind !== 'settings') return 'wrong-app';
  const result = applySettingsAction(state.settings, app, action);
  if (typeof result === 'string') return result;
  const next = withApp({ ...state, settings: result.settings }, window, result.panel);
  return result.changed === null ? done(next) : done(next, { type: 'setting-changed', ...result.changed });
}

// Commands

const TEXT_COMMANDS: Readonly<Partial<Record<CommandId, TextCommandOp>>> = {
  undo: { type: 'undo' },
  redo: { type: 'redo' },
  cut: { type: 'cut' },
  copy: { type: 'copy' },
  paste: { type: 'paste' },
  'select-all': { type: 'select-all' },
};

/**
 * Runs a command, or says why it cannot run now. This is the only place that decides: the
 * menus ask it, through `isCommandEnabled`, whether each item is enabled.
 */
function runCommand(state: DesktopState, window: WindowState, command: CommandId, env: DesktopEnv): Step {
  const { app } = window;
  if (window.minimized || !appHasCommand(app.kind, command)) return 'command-disabled';
  if (command === 'close') return closeWindow(state, window);
  const field = activeField(app);
  const textOp = TEXT_COMMANDS[command];
  if (textOp !== undefined && field !== null) return textCommand(state, window, field, textOp, env);
  // While a save or open dialog is up, only its name field and Close work.
  if (isDocumentApp(app) && app.dialog !== null) return 'command-disabled';
  switch (app.kind) {
    case 'notepad':
      return documentCommand(state, window, app, command) ?? 'command-disabled';
    case 'picture-viewer':
      return viewerCommand(state, window, app, command);
    case 'file-explorer':
      return explorerCommand(state, window, app, command);
    case 'music-box':
      return musicCommand(state, window, app, command);
    case 'calculator':
      return calculatorCommand(state, window, app, command, env);
    // 'settings', whose menus hold only Close and the edit commands, both handled above.
    default:
      return 'command-disabled';
  }
}

/**
 * Keeps windows pointing at things that still exist after the file system changed: an explorer
 * or dialog whose folder went away or into the trash goes home, and a selection of a removed
 * item clears. Runs only when the file system changed.
 */
export function repairWindows(state: DesktopState): DesktopState {
  const { fs } = state;
  const existing = (id: string | null) => (getNode(fs, id) === undefined ? null : id);
  const usable = (id: string, allowTrash: boolean) =>
    isFolder(getNode(fs, id)) && (id === TRASH_ID ? allowTrash : !isTrashed(fs, id)) ? id : HOME_ID;
  const windows = state.windows.map((window): WindowState => {
    const { app } = window;
    if (app.kind === 'file-explorer') {
      const renaming = app.rename?.nodeId ?? null;
      const rename = existing(renaming) === null || isTrashed(fs, renaming ?? '') ? null : app.rename;
      return {
        ...window,
        app: { ...app, folderId: usable(app.folderId, true), selectedId: existing(app.selectedId), rename },
      };
    }
    if (!isDocumentApp(app) || app.dialog === null) return window;
    const { dialog } = app;
    const folderId = usable(dialog.folderId, false);
    const selectedId = folderId === dialog.folderId ? existing(dialog.selectedId) : null;
    return {
      ...window,
      app: { ...app, dialog: { ...dialog, folderId, selectedId, replaceId: existing(dialog.replaceId) } },
    };
  });
  return { ...state, windows };
}

function handle(state: DesktopState, action: DesktopAction, env: DesktopEnv): Step {
  switch (action.type) {
    case 'open-app':
      return openWindow(state, createApp(action.app, state), action.size, action.maximized);
    case 'open-file':
      return openFile(state, action.fileId, action.size, action.maximized);
    case 'open-folder':
      return openFolder(state, action.folderId, action.size, action.maximized);
    case 'focus-next-window': {
      const back = state.windows[0];
      return back === undefined ? done(state) : activate(state, back);
    }
    case 'set-desktop-size':
      return setDesktopSize(state, action.width, action.height);
    case 'set-volume':
      return setVolume(state, action.volume);
    case 'set-muted':
      return setMuted(state, action.muted);
    default:
      return windowAction(state, action, env);
  }
}

type WindowAction = Extract<DesktopAction, { windowId: string }>;

function windowAction(state: DesktopState, action: WindowAction, env: DesktopEnv): Step {
  const window = findWindow(state, action.windowId);
  if (window === undefined) return 'no-window';
  switch (action.type) {
    case 'close-window':
      return closeWindow(state, window);
    case 'focus-window':
      return window.minimized ? 'minimized' : bringToFront(state, window);
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
  // Repairing only after a file system change keeps an unchanged window the same object.
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
