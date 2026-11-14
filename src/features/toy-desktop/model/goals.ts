/**
 * Small checks lessons reuse to ask "did the child do it?". Each takes the state, or the events
 * of a transition, and returns a boolean. Places are paths under home such as "Pictures/Fox";
 * names match ignoring case, as the toy file system does.
 */
import type { CommandId } from './commands.ts';
import type { DesktopEvent, DesktopEventType } from './events.ts';
import { isFile, isTrashed, listFolder, nodeAtPath, TRASH_ID } from './fileSystem.ts';
import { sameName } from './names.ts';
import type { AppKind, DesktopState, WindowState } from './state.ts';

export function windowsOf(state: DesktopState, app: AppKind): WindowState[] {
  return state.windows.filter((window) => window.app.kind === app);
}

/** True when a window of this app is open, minimized or not. */
export function isAppOpen(state: DesktopState, app: AppKind): boolean {
  return windowsOf(state, app).length > 0;
}

export function isWindowOpen(state: DesktopState, windowId: string): boolean {
  return state.windows.some((window) => window.id === windowId);
}

/** True when the focused window shows this app. */
export function isAppFocused(state: DesktopState, app: AppKind): boolean {
  return state.windows.some((window) => window.id === state.focusedWindowId && window.app.kind === app);
}

export function isWindowFocused(state: DesktopState, windowId: string): boolean {
  return state.focusedWindowId === windowId;
}

export function isWindowMinimized(state: DesktopState, windowId: string): boolean {
  return state.windows.some((window) => window.id === windowId && window.minimized);
}

export function isWindowMaximized(state: DesktopState, windowId: string): boolean {
  return state.windows.some((window) => window.id === windowId && window.maximized && !window.minimized);
}

/** The window showing the file at this path, if one is open. */
export function windowWithFile(state: DesktopState, path: string): WindowState | undefined {
  const file = nodeAtPath(state.fs, path);
  if (file === undefined) return undefined;
  return state.windows.find((window) => 'fileId' in window.app && window.app.fileId === file.id);
}

/** True when the folder at `folderPath` holds an item named `name`. "" is home. */
export function isInFolder(state: DesktopState, name: string, folderPath: string): boolean {
  const folder = nodeAtPath(state.fs, folderPath);
  // A file at that path lists nothing.
  if (folder === undefined) return false;
  return listFolder(state.fs, folder.id).some((node) => sameName(node.name, name));
}

/** True when a folder exists at this path. */
export function folderExists(state: DesktopState, path: string): boolean {
  return nodeAtPath(state.fs, path)?.kind === 'folder';
}

/** True when the trash holds an item with this name. */
export function isInTrash(state: DesktopState, name: string): boolean {
  return listFolder(state.fs, TRASH_ID).some((node) => sameName(node.name, name));
}

function containsText(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('en').includes(needle.trim().toLocaleLowerCase('en'));
}

/**
 * True when a note holds the text, ignoring case. With `file`, the saved note at that path;
 * without it, any open notepad, saved or not.
 */
export function noteContains(state: DesktopState, text: string, options: { file?: string } = {}): boolean {
  if (options.file !== undefined) {
    const file = nodeAtPath(state.fs, options.file);
    return file?.kind === 'note' && containsText(file.text, text);
  }
  return state.windows.some((window) => window.app.kind === 'notepad' && containsText(window.app.editor.text, text));
}

/** True when the last command run was this one, in this app when one is given. */
export function lastCommandWas(state: DesktopState, command: CommandId, app?: AppKind): boolean {
  const last = state.lastCommand;
  return last !== null && last.command === command && (app === undefined || last.app === app);
}

/** True when a saved file with this name is anywhere under home. */
export function fileExists(state: DesktopState, name: string): boolean {
  return Object.values(state.fs.nodes).some(
    (node) => isFile(node) && sameName(node.name, name) && !isTrashed(state.fs, node.id),
  );
}

/** True when an event of this type happened, and it passes `where` when given. */
export function hasEvent<T extends DesktopEventType>(
  events: readonly DesktopEvent[],
  type: T,
  where: (event: Extract<DesktopEvent, { type: T }>) => boolean = () => true,
): boolean {
  return events.filter((event): event is Extract<DesktopEvent, { type: T }> => event.type === type).some(where);
}
