/** Checks about the file explorer that several lessons share. Pure, like `model/goals.ts`. */
import type { HighlightTarget } from '../../desktop/parts.ts';
import { HOME_ID } from '../../model/fileSystem.ts';
import { windowsOf } from '../../model/goals.ts';
import type { DesktopState, FileExplorerState } from '../../model/state.ts';

/** Every open file explorer, front last. */
export function explorers(state: DesktopState): FileExplorerState[] {
  return windowsOf(state, 'file-explorer').flatMap((window) =>
    window.app.kind === 'file-explorer' ? [window.app] : [],
  );
}

/** True when an open file explorer shows this folder, not search results. */
export function explorerShows(state: DesktopState, folderId: string): boolean {
  return explorers(state).some((explorer) => explorer.folderId === folderId && explorer.search.text.trim() === '');
}

/**
 * Where to point to reach an item: the item itself when an explorer shows its folder, the folder
 * when an explorer shows home, and otherwise Home in the explorer's side list.
 */
export function pointToward(state: DesktopState, key: string, folderId: string): HighlightTarget {
  if (explorerShows(state, folderId)) return { kind: 'key', key };
  if (explorerShows(state, HOME_ID) && state.fs.nodes[folderId]?.parentId === HOME_ID) {
    return { kind: 'key', key: `item:${folderId}` };
  }
  return { kind: 'key', key: `place:${HOME_ID}` };
}
