import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { explorerItems } from '../../model/desktop.ts';
import { hasEvent } from '../../model/goals.ts';
import { findWindow, type DesktopState } from '../../model/state.ts';
import { explorers } from '../harness/explorerGoals.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { FindItLevel } from './level.ts';
import { strings } from './strings.ts';

/** The instruction for each file in `TARGETS`, in the same order. */
export const FIND: readonly SpokenHandle[] = [
  strings.findKitePlan,
  strings.findOwlFacts,
  strings.findCakeRecipe,
  strings.findFrogSong,
  strings.findMoonDance,
  strings.findBoatTrip,
  strings.findRedTractor,
  strings.findFoxDen,
];

/** Two steps: search until the file shows, then open it from the results. */
export function findItSteps({ target, fileId }: FindItLevel): LessonStep[] {
  const showsFile = (state: DesktopState, windowId: string) => {
    const app = findWindow(state, windowId)?.app;
    return app !== undefined && 'fileId' in app && app.fileId === fileId;
  };
  const found = (state: DesktopState) =>
    explorers(state).some(
      (explorer) =>
        explorer.search.text.trim() !== '' && explorerItems(state.fs, explorer).some((node) => node.id === fileId),
    );
  return [
    {
      instruction: FIND[target] ?? strings.instruction,
      done: found,
      hint: () => ({ kind: 'key', key: 'search' }),
    },
    {
      instruction: strings.openIt,
      // Opened, or brought forward when it was open already.
      done: (state, events) =>
        hasEvent(events, 'file-opened', (event) => event.nodeId === fileId) ||
        hasEvent(events, 'window-focused', (event) => showsFile(state, event.windowId)),
      wrong: ({ events }) => hasEvent(events, 'file-opened', (event) => event.nodeId !== fileId),
      hint: (state) => (found(state) ? { kind: 'key', key: `item:${fileId}` } : { kind: 'key', key: 'search' }),
    },
  ];
}
