import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { hasEvent, isWindowMaximized, isWindowMinimized, windowsOf } from '../../model/goals.ts';
import type { AppKind } from '../../model/state.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { SwitchLevel } from './level.ts';
import { strings } from './strings.ts';

export const FIND: Readonly<Record<Exclude<AppKind, 'settings'>, SpokenHandle>> = {
  notepad: strings.findNotepad,
  'picture-viewer': strings.findPictureViewer,
  'file-explorer': strings.findFileExplorer,
  'music-box': strings.findMusicBox,
  calculator: strings.findCalculator,
};

/**
 * Find the window and bring it to the front, then make it fill the screen, and at higher
 * difficulty put it away in the task strip.
 */
export function switchSteps({ target, finish, desktop }: SwitchLevel): LessonStep[] {
  const windowId = windowsOf(desktop, target)[0]?.id ?? 'w1';
  const find: LessonStep = {
    instruction: target === 'settings' ? strings.instruction : FIND[target],
    done: (state) => state.focusedWindowId === windowId && !isWindowMinimized(state, windowId),
    // Choosing another window's button in the task strip is a wrong pick. Clicking around the
    // windows themselves is how a child looks, so it is not.
    wrong: (_transition, action) => action.type === 'activate-window' && action.windowId !== windowId,
    nudge: strings.lookAtStrip,
    hint: () => ({ kind: 'task', windowId }),
  };
  const later = finish.map((kind): LessonStep =>
    kind === 'maximize'
      ? {
          instruction: strings.maximize,
          done: (state) => isWindowMaximized(state, windowId),
          // Putting it away instead is a try. Other windows coming forward as a keyboard user
          // moves through them is not.
          wrong: ({ events }) => hasEvent(events, 'window-minimized'),
          hint: () => ({ kind: 'window-control', windowId, control: 'maximize' }),
        }
      : {
          instruction: strings.minimize,
          done: (state) => isWindowMinimized(state, windowId),
          wrong: ({ events }) => hasEvent(events, 'window-unmaximized'),
          hint: () => ({ kind: 'window-control', windowId, control: 'minimize' }),
        },
  );
  return [find, ...later];
}
