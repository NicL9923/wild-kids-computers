import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { ancestry, isTrashed, TRASH_ID } from '../../model/fileSystem.ts';
import { hasEvent } from '../../model/goals.ts';
import { explorers, explorerShows, pointToward } from '../harness/explorerGoals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { LessonPictureId } from '../harness/lessonFiles.ts';
import type { TrashLevel } from './level.ts';
import { strings } from './strings.ts';

const DELETE: Readonly<Record<LessonPictureId, SpokenHandle>> = {
  fox: strings.deleteFox,
  sunflower: strings.deleteSunflower,
  sailboat: strings.deleteBoat,
  rainbow: strings.deleteRainbow,
  butterfly: strings.deleteButterfly,
  tractor: strings.deleteTractor,
};

/** Three steps: put the named picture in the trash, open the trash, and restore the picture. */
export function trashSteps({ pictureId, fileId, folderId }: TrashLevel): LessonStep[] {
  type State = Parameters<LessonStep['done']>[0];
  // A picture in a folder that went in the trash is in the trash too, as on a real computer.
  const inTrash = (state: State) => isTrashed(state.fs, fileId);
  /** What lies in the trash holding the picture: the picture itself, or the folder it went in with. */
  const heldBy = (state: State) => ancestry(state.fs, fileId).find((node) => node.parentId === TRASH_ID)?.id ?? fileId;
  return [
    {
      instruction: DELETE[pictureId],
      done: inTrash,
      // Another picture in the trash, a move, or opening a picture instead is another try.
      wrong: ({ events }) =>
        hasEvent(events, 'node-trashed') || hasEvent(events, 'node-moved') || hasEvent(events, 'file-opened'),
      hint: (state) => pointToward(state, `move:${fileId}`, folderId),
    },
    {
      instruction: strings.openTrash,
      done: (state) => explorerShows(state, TRASH_ID),
      hint: () => ({ kind: 'key', key: `place:${TRASH_ID}` }),
    },
    {
      instruction: strings.restore,
      // Out of the trash. Restore puts it back in the folder it came from.
      done: (state) => state.fs.nodes[fileId] !== undefined && !isTrashed(state.fs, fileId),
      wrong: ({ events }) => hasEvent(events, 'node-restored', (event) => event.nodeId !== fileId),
      hint: (state) => {
        if (!explorerShows(state, TRASH_ID)) return { kind: 'key', key: `place:${TRASH_ID}` };
        const holder = heldBy(state);
        const picked = explorers(state).some((explorer) => explorer.selectedId === holder);
        return picked ? { kind: 'command', command: 'restore' } : { kind: 'key', key: `item:${holder}` };
      },
    },
  ];
}
