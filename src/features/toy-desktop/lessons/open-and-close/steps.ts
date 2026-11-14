import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { hasEvent, isAppOpen, windowsOf } from '../../model/goals.ts';
import type { AppKind } from '../../model/state.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { OpenCloseLevel } from './level.ts';
import { strings } from './strings.ts';

const OPEN: Readonly<Partial<Record<AppKind, SpokenHandle>>> = {
  notepad: strings.openNotepad,
  'picture-viewer': strings.openPictureViewer,
  'file-explorer': strings.openFileExplorer,
  'music-box': strings.openMusicBox,
  calculator: strings.openCalculator,
};

/** Two steps: open the named app from its desktop icon, then close its window. */
export function openCloseSteps({ app, icons }: OpenCloseLevel): LessonStep[] {
  return [
    {
      instruction: OPEN[app] ?? strings.instruction,
      done: (state) => isAppOpen(state, app),
      wrong: ({ events }) => hasEvent(events, 'window-opened', (event) => event.app !== app),
      hint: () => ({ kind: 'icon', index: icons.indexOf(app) }),
    },
    {
      instruction: strings.close,
      done: (state) => !isAppOpen(state, app),
      // Another window opening or closing, or this one shrinking or growing, is not closing it.
      wrong: ({ events }) =>
        hasEvent(events, 'window-opened') ||
        hasEvent(events, 'window-closed') ||
        hasEvent(events, 'window-minimized') ||
        hasEvent(events, 'window-maximized'),
      hint: (state) => {
        const window = windowsOf(state, app)[0];
        return window === undefined ? null : { kind: 'window-control', windowId: window.id, control: 'close' };
      },
    },
  ];
}
