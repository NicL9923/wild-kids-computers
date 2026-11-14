import type { OsFamily } from '../../../../core/platform/bridge.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import { hasEvent, isWindowFocused } from '../../model/goals.ts';
import type { DesktopState } from '../../model/state.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { Route, UndoRedoLevel } from './level.ts';
import { strings } from './strings.ts';

type Say = 'undoWord' | 'undoDot' | 'undoDotNext' | 'redo';

const SAY: Readonly<Record<Say, Readonly<Record<'menu' | OsFamily, SpokenHandle>>>> = {
  undoWord: {
    menu: strings.undoWord,
    windows: strings.undoWordCtrl,
    linux: strings.undoWordCtrl,
    mac: strings.undoWordCmd,
  },
  undoDot: { menu: strings.undoDot, windows: strings.undoDotCtrl, linux: strings.undoDotCtrl, mac: strings.undoDotCmd },
  undoDotNext: {
    menu: strings.undoDotNext,
    windows: strings.undoDotNextCtrl,
    linux: strings.undoDotNextCtrl,
    mac: strings.undoDotNextCmd,
  },
  redo: { menu: strings.redo, windows: strings.redoCtrl, linux: strings.redoCtrl, mac: strings.redoCmd },
};

/** What the child hears for a step: the menu route, or the shortcut with this computer's modifier. */
export function undoRedoSay(say: Say, route: Route, os: OsFamily): SpokenHandle {
  return SAY[say][route === 'menu' ? 'menu' : os];
}

/** Undo or redo in the other window is another try. */
const elsewhere =
  (windowId: string): LessonStep['wrong'] =>
  ({ events }) =>
    hasEvent(events, 'undone', (event) => event.windowId !== windowId) ||
    hasEvent(events, 'redone', (event) => event.windowId !== windowId);

/**
 * Undo then redo in each app of the round, in order. Each step is done by the event from the
 * right window, whether the child used the menu or the keys.
 */
export function undoRedoSteps({ apps, route, windows }: UndoRedoLevel, os: OsFamily): LessonStep[] {
  const say = (which: Say) => undoRedoSay(which, route, os);
  const pointIn =
    (windowId: string) =>
    (state: DesktopState): HighlightTarget | null => {
      if (!isWindowFocused(state, windowId)) return { kind: 'title-bar', windowId };
      return route === 'menu' ? { kind: 'menu', menu: 'edit' } : null;
    };

  return apps.flatMap((app, index): LessonStep[] => {
    const windowId = windows[app];
    if (windowId === undefined) throw new Error(`undo-and-redo: no window for ${app}`);
    const undo: Say = app === 'notepad' ? 'undoWord' : index === 0 ? 'undoDot' : 'undoDotNext';
    return [
      {
        instruction: say(undo),
        done: (_state, events) => hasEvent(events, 'undone', (event) => event.windowId === windowId),
        wrong: elsewhere(windowId),
        hint: pointIn(windowId),
      },
      {
        instruction: say('redo'),
        done: (_state, events) => hasEvent(events, 'redone', (event) => event.windowId === windowId),
        wrong: elsewhere(windowId),
        hint: pointIn(windowId),
      },
    ];
  });
}
