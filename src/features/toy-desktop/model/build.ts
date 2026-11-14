/**
 * Builders for a starting desktop. A lesson's level generator describes folders, files, and
 * windows in a few lines; `buildDesktop` turns that into a valid state through the same
 * transitions the child uses. A bad description is an author's mistake, so it throws.
 */
import { defaultSettings, type ToySettings } from './apps/settingsPanel.ts';
import { tuneFrom } from './apps/tune.ts';
import { reduce, type DesktopAction, type DesktopEnv } from './desktop.ts';
import {
  createFolder,
  emptyFileSystem,
  FILE_KINDS,
  HOME_ID,
  isFolder,
  nodeAtPath,
  saveNewFile,
  trashNode,
  type FileContent,
} from './fileSystem.ts';
import { clampDesktopSize, clampWindowRect, DEFAULT_DESKTOP_SIZE, type Size } from './geometry.ts';
import { topVisibleWindow, type AppKind, type DesktopState, type SystemState, type WindowState } from './state.ts';
import { createEditor } from './textEditor.ts';

/** A file in a tree spec. Make one with `note`, `picture`, or `tune`. */
export type FileSpec = FileContent;

/** Folders and files by name. A nested object is a folder. */
export interface TreeSpec {
  [name: string]: TreeSpec | FileSpec;
}

export const note = (text = ''): FileSpec => ({ kind: 'note', text });
export const picture = (pictureId: string): FileSpec => ({ kind: 'picture', pictureId });
/** A tune from `[step, note]` pairs that sound. */
export const tune = (on: readonly (readonly [number, number])[] = []): FileSpec => ({
  kind: 'tune',
  tune: tuneFrom(on),
});

interface WindowPlacement {
  /** The top left corner. Clamped so the window stays reachable. */
  at?: { x: number; y: number };
  size?: Size;
  minimized?: boolean;
  maximized?: boolean;
}

export type WindowSpec = WindowPlacement &
  (
    | { app: 'notepad'; /** Unsaved text in a new note. */ text?: string }
    | { app: 'file-explorer'; /** The folder it shows, as a path under home. */ folder?: string }
    | { app: Exclude<AppKind, 'notepad' | 'file-explorer'> }
    /** A file to open in its app, as a path under home, such as "Pictures/Fox". */
    | { file: string }
  );

export interface DesktopSpec {
  size?: Size;
  files?: TreeSpec;
  /** Items in the trash by name, each with the folder it was deleted from, as a path under home. */
  trash?: Record<string, { from: string; item: TreeSpec | FileSpec }>;
  /** Opened in order, so later windows are in front. */
  windows?: WindowSpec[];
  /** Index in `windows` of the window with focus. Defaults to the front window that is not minimized. */
  focus?: number;
  system?: Partial<SystemState>;
  settings?: Partial<ToySettings>;
}

/** A desktop with an empty home folder and no windows. */
export function emptyDesktop(size: Size = DEFAULT_DESKTOP_SIZE): DesktopState {
  return {
    size: clampDesktopSize(size),
    windows: [],
    focusedWindowId: null,
    fs: emptyFileSystem(),
    system: { volume: 80, muted: false },
    settings: defaultSettings(),
    lastCommand: null,
    nextId: 1,
    nextWindowId: 1,
  };
}

function isFileSpec(value: TreeSpec | FileSpec): value is FileSpec {
  return typeof value.kind === 'string' && (FILE_KINDS as readonly string[]).includes(value.kind);
}

function fail(message: string): never {
  throw new Error(`buildDesktop: ${message}`);
}

function addItem(state: DesktopState, parentId: string, name: string, item: TreeSpec | FileSpec): DesktopState {
  const nodeId = `n${state.nextId}`;
  const added = isFileSpec(item)
    ? saveNewFile(state.fs, parentId, name, item, nodeId)
    : createFolder(state.fs, parentId, name, nodeId);
  if (!added.ok) fail(`cannot add "${name}": ${added.problem}`);
  const next = { ...state, fs: added.fs, nextId: state.nextId + 1 };
  return isFileSpec(item) ? next : addTree(next, nodeId, item);
}

function addTree(state: DesktopState, parentId: string, tree: TreeSpec): DesktopState {
  return Object.entries(tree).reduce((current, [name, item]) => addItem(current, parentId, name, item), state);
}

/** The id of the item at a path under home, such as "Pictures/Fox". Throws when there is none. */
export function pathId(state: DesktopState, path: string): string {
  return nodeAtPath(state.fs, path)?.id ?? fail(`nothing at "${path}"`);
}

function folderId(state: DesktopState, path: string): string {
  const id = pathId(state, path);
  return isFolder(state.fs.nodes[id]) ? id : fail(`"${path}" is not a folder`);
}

/** Opening windows never touches the clipboard. Anything that tries is a bug here. */
const NO_CLIPBOARD: DesktopEnv = {
  clipboard: {
    read: () => fail('opening a window read the clipboard'),
    write: () => fail('opening a window wrote the clipboard'),
  },
};

function openWindow(state: DesktopState, spec: WindowSpec): DesktopState {
  const action: DesktopAction =
    'file' in spec ? { type: 'open-file', fileId: pathId(state, spec.file) } : { type: 'open-app', app: spec.app };
  const opened = reduce(state, action, NO_CLIPBOARD);
  const rejected = opened.events.find((event) => event.type === 'rejected');
  if (rejected !== undefined) fail(`cannot open ${JSON.stringify(spec)}: ${rejected.reason}`);
  const window = opened.state.windows.at(-1) ?? fail('no window opened');
  let app = window.app;
  if ('app' in spec && spec.app === 'notepad' && spec.text !== undefined && app.kind === 'notepad') {
    app = { ...app, editor: createEditor({ text: spec.text, multiline: true, maxLength: app.editor.maxLength }) };
  }
  if ('app' in spec && spec.app === 'file-explorer' && spec.folder !== undefined && app.kind === 'file-explorer') {
    app = { ...app, folderId: folderId(state, spec.folder) };
  }
  const rect = clampWindowRect({ ...window.rect, ...spec.at, ...spec.size }, state.size);
  const placed: WindowState = {
    ...window,
    app,
    rect,
    maximized: spec.maximized ?? false,
    minimized: spec.minimized ?? false,
  };
  return { ...opened.state, windows: opened.state.windows.map((other) => (other.id === window.id ? placed : other)) };
}

/**
 * Builds a starting desktop.
 *
 * ```ts
 * const state = buildDesktop({
 *   files: { Pictures: { Fox: picture('fox') }, 'Shopping list': note('apples') },
 *   windows: [{ app: 'file-explorer', folder: 'Pictures' }, { file: 'Shopping list' }],
 * });
 * ```
 */
export function buildDesktop(spec: DesktopSpec = {}): DesktopState {
  let state = addTree(emptyDesktop(spec.size), HOME_ID, spec.files ?? {});
  for (const [name, { from, item }] of Object.entries(spec.trash ?? {})) {
    const added = `n${state.nextId}`;
    state = addItem(state, folderId(state, from), name, item);
    const trashed = trashNode(state.fs, added);
    if (!trashed.ok) fail(`cannot trash "${name}": ${trashed.problem}`);
    state = { ...state, fs: trashed.fs };
  }
  state = {
    ...state,
    system: { ...state.system, ...spec.system },
    settings: { ...state.settings, ...spec.settings },
  };
  const windowIds: string[] = [];
  for (const windowSpec of spec.windows ?? []) {
    state = openWindow(state, windowSpec);
    windowIds.push(state.windows.at(-1)?.id ?? fail('no window opened'));
  }
  return focusAt(
    state,
    spec.focus === undefined ? undefined : (windowIds[spec.focus] ?? fail(`no window ${spec.focus}`)),
  );
}

function focusAt(state: DesktopState, windowId: string | undefined): DesktopState {
  if (windowId === undefined) return { ...state, focusedWindowId: topVisibleWindow(state)?.id ?? null };
  const window = state.windows.find((other) => other.id === windowId);
  if (window === undefined || window.minimized) fail('the focused window must be open and not minimized');
  return {
    ...state,
    windows: [...state.windows.filter((other) => other !== window), window],
    focusedWindowId: windowId,
  };
}
