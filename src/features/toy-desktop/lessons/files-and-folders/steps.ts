import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { HOME_ID } from '../../model/fileSystem.ts';
import type { DesktopState } from '../../model/state.ts';
import { hasEvent } from '../../model/goals.ts';
import { explorerShows, pointToward } from '../harness/explorerGoals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { LessonFileKind } from '../harness/lessonFiles.ts';
import type { FilesFoldersLevel } from './level.ts';
import { strings } from './strings.ts';

const MOVE: Readonly<Record<LessonFileKind, SpokenHandle>> = {
  picture: strings.movePicture,
  tune: strings.moveTune,
  note: strings.moveNote,
};

const OPEN: Readonly<Record<LessonFileKind, SpokenHandle>> = {
  picture: strings.openPictures,
  tune: strings.openMusic,
  note: strings.openNotes,
};

/**
 * Up to five steps, each with its own instruction: go home if the explorer starts elsewhere, move
 * the file into its folder, open that folder, make a new folder, and name it.
 */
export function filesFoldersSteps(level: FilesFoldersLevel): LessonStep[] {
  const { kind, fileId, folderId, startFolderId } = level;
  const startIds = new Set(Object.keys(level.desktop.fs.nodes));
  const isNew = (nodeId: string) => !startIds.has(nodeId);
  // The folder the instruction names must stay where the child can see it. Moved into another
  // folder or into the trash, it is gone from home, so the step starts over with it back.
  const folderAtHome = (state: DesktopState) =>
    state.fs.nodes[folderId]?.parentId === level.desktop.fs.nodes[folderId]?.parentId;

  const goHome: LessonStep = {
    instruction: strings.goHome,
    done: (state) => explorerShows(state, HOME_ID),
    wrong: ({ events }) => hasEvent(events, 'folder-opened', (event) => event.folderId !== HOME_ID),
    hint: () => ({ kind: 'key', key: `place:${HOME_ID}` }),
  };
  const move: LessonStep = {
    instruction: MOVE[kind],
    done: (state) => state.fs.nodes[fileId]?.parentId === folderId,
    possible: folderAtHome,
    // Moving something else, or opening the file instead of picking it up, is another try.
    wrong: ({ events }) =>
      hasEvent(events, 'node-moved') || hasEvent(events, 'node-trashed') || hasEvent(events, 'file-opened'),
    hint: (state) => pointToward(state, `move:${fileId}`, HOME_ID),
  };
  const open: LessonStep = {
    instruction: OPEN[kind],
    done: (state) => explorerShows(state, folderId),
    possible: folderAtHome,
    wrong: ({ events }) => hasEvent(events, 'folder-opened', (event) => event.folderId !== HOME_ID),
    hint: (state) => pointToward(state, `item:${folderId}`, HOME_ID),
  };
  const make: LessonStep = {
    instruction: strings.newFolder,
    done: (_state, events) => hasEvent(events, 'folder-created'),
    hint: () => ({ kind: 'command', command: 'new-folder' }),
  };
  const name: LessonStep = {
    instruction: strings.nameFolder,
    done: (_state, events) => hasEvent(events, 'node-renamed', (event) => isNew(event.nodeId)),
    // Renaming a folder that was there before is not naming the new one.
    wrong: ({ events }) => hasEvent(events, 'node-renamed', (event) => !isNew(event.nodeId)),
    hint: () => ({ kind: 'command', command: 'rename' }),
  };
  return startFolderId === null ? [move, open, make, name] : [goHome, move, open, make, name];
}
