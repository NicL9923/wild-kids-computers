/**
 * The shape of the toy desktop: one plain value that saves as JSON. The saved document wraps
 * it with a version through `activityStateDocument`, so the state has no version of its own.
 * Transitions live in `desktop.ts`; this file holds the types and the read helpers that both
 * the reducer and the goal checks use.
 */
import type { CalculatorState } from './apps/calculator.ts';
import type { MusicBoxGrid } from './apps/musicBox.ts';
import type { SettingsPanelState, ToySettings } from './apps/settingsPanel.ts';
import { sameTune, type Tune } from './apps/tune.ts';
import type { CommandId } from './commands.ts';
import type { FileSystem } from './fileSystem.ts';
import type { Rect, Size } from './geometry.ts';
import type { TextEditorState } from './textEditor.ts';

/** The most windows open at once. Enough for every app twice, few enough to keep track of. */
export const MAX_WINDOWS = 8;

export const APP_KINDS = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator', 'settings'] as const;
export type AppKind = (typeof APP_KINDS)[number];

/** A save or open dialog inside a window. Single click opens a folder; a file is selected, then confirmed. */
export interface FileDialog {
  mode: 'save-as' | 'open';
  folderId: string;
  selectedId: string | null;
  /** The name field. Used by save-as. */
  name: TextEditorState;
  /** Set when save-as found a file of the same kind with that name, until the child confirms again. */
  replaceId: string | null;
}

export interface NotepadState {
  kind: 'notepad';
  /** The note this window shows, or null for a note not saved yet. */
  fileId: string | null;
  editor: TextEditorState;
  /** The text as last saved or opened. The note has unsaved changes when the text differs. */
  savedText: string;
  dialog: FileDialog | null;
}

/** @public */
export interface PictureViewerState {
  kind: 'picture-viewer';
  fileId: string | null;
  dialog: FileDialog | null;
}

export interface FileExplorerState {
  kind: 'file-explorer';
  folderId: string;
  selectedId: string | null;
  /** The search field. While it holds text, the explorer shows matches instead of the folder. */
  search: TextEditorState;
  /** The item being renamed, with its name field, or null. */
  rename: { nodeId: string; field: TextEditorState } | null;
}

/** @public */
export interface MusicBoxState extends MusicBoxGrid {
  kind: 'music-box';
  fileId: string | null;
  /** The tune as last saved or opened. */
  savedTune: Tune;
  dialog: FileDialog | null;
}

export type AppState =
  | NotepadState
  | PictureViewerState
  | FileExplorerState
  | MusicBoxState
  | CalculatorState
  | SettingsPanelState;

export interface WindowState {
  id: string;
  /** The window's normal place and size. A maximized window keeps it for when it is restored. */
  rect: Rect;
  minimized: boolean;
  maximized: boolean;
  app: AppState;
}

export interface SystemState {
  /** Sound volume from 0 to 100. */
  volume: number;
  muted: boolean;
}

export interface DesktopState {
  /** The desktop area windows live in, without the task strip. */
  size: Size;
  /** Back to front: the last window is on top. */
  windows: WindowState[];
  focusedWindowId: string | null;
  fs: FileSystem;
  system: SystemState;
  settings: ToySettings;
  /** The last command the child ran, and in which app. */
  lastCommand: { command: CommandId; app: AppKind } | null;
  /** The next number for a new file or folder id, such as "n12". Ids are never reused. */
  nextId: number;
  /** The next number for a new window id, such as "w3". Ids are never reused. */
  nextWindowId: number;
}

export function findWindow(state: DesktopState, windowId: string): WindowState | undefined {
  return state.windows.find((window) => window.id === windowId);
}

/** The window in front that is not minimized, which is the one that gets focus. */
export function topVisibleWindow(state: DesktopState, exceptId?: string): WindowState | undefined {
  return state.windows.findLast((window) => !window.minimized && window.id !== exceptId);
}

/** @public */
export function focusedWindow(state: DesktopState): WindowState | undefined {
  return state.focusedWindowId === null ? undefined : findWindow(state, state.focusedWindowId);
}

/** True when a notepad or music box holds changes it has not saved. */
export function hasUnsavedChanges(app: AppState): boolean {
  if (app.kind === 'notepad') return app.editor.text !== app.savedText;
  if (app.kind === 'music-box') return !sameTune(app.tune, app.savedTune);
  return false;
}
