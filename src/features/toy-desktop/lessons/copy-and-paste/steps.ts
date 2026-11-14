import type { OsFamily } from '../../../../core/platform/bridge.ts';
import type { SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import type { HighlightTarget } from '../../desktop/parts.ts';
import { hasEvent, isWindowFocused } from '../../model/goals.ts';
import { findWindow, type DesktopState } from '../../model/state.ts';
import type { TextClipboard } from '../../model/textEditor.ts';
import type { LessonStep } from '../harness/lesson.ts';
import { CALCULATOR_WINDOW, NOTEPAD_WINDOW, type CopyPasteLevel, type Route } from './level.ts';
import { strings } from './strings.ts';

type Say = 'calculatorCopy' | 'notePaste' | 'noteSelect' | 'noteCopy' | 'calculatorPaste';

const SAY: Readonly<Record<Say, Readonly<Record<'menu' | OsFamily, SpokenHandle>>>> = {
  calculatorCopy: {
    menu: strings.calculatorCopy,
    windows: strings.calculatorCopyCtrl,
    linux: strings.calculatorCopyCtrl,
    mac: strings.calculatorCopyCmd,
  },
  notePaste: {
    menu: strings.notePaste,
    windows: strings.notePasteCtrl,
    linux: strings.notePasteCtrl,
    mac: strings.notePasteCmd,
  },
  noteSelect: {
    menu: strings.noteSelect,
    windows: strings.noteSelectCtrl,
    linux: strings.noteSelectCtrl,
    mac: strings.noteSelectCmd,
  },
  noteCopy: {
    menu: strings.noteCopy,
    windows: strings.noteCopyCtrl,
    linux: strings.noteCopyCtrl,
    mac: strings.noteCopyCmd,
  },
  calculatorPaste: {
    menu: strings.calculatorPaste,
    windows: strings.calculatorPasteCtrl,
    linux: strings.calculatorPasteCtrl,
    mac: strings.calculatorPasteCmd,
  },
};

/** What the child hears for a step: the menu route, or the shortcut with this computer's modifier. */
export function copyPasteSay(say: Say, route: Route, os: OsFamily): SpokenHandle {
  return SAY[say][route === 'menu' ? 'menu' : os];
}

/** The text selected in the note. */
function noteSelection(state: DesktopState): string {
  const app = findWindow(state, NOTEPAD_WINDOW)?.app;
  if (app?.kind !== 'notepad') return '';
  const { text, anchor, caret } = app.editor;
  return text.slice(Math.min(anchor, caret), Math.max(anchor, caret));
}

/** The whole text of the note. */
function noteText(state: DesktopState): string {
  const app = findWindow(state, NOTEPAD_WINDOW)?.app;
  return app?.kind === 'notepad' ? app.editor.text : '';
}

function calculatorShows(state: DesktopState, number: string): boolean {
  const app = findWindow(state, CALCULATOR_WINDOW)?.app;
  return app?.kind === 'calculator' && app.display === number;
}

/** Pasting in the wrong place, or something the calculator cannot take, is another try. */
const pastedElse =
  (into: string): LessonStep['wrong'] =>
  ({ events }) =>
    hasEvent(events, 'pasted', (event) => event.windowId !== into) ||
    hasEvent(events, 'rejected', (event) => event.reason === 'not-a-number');

/**
 * Two steps from the calculator (copy, paste) or three from the note (select, copy, paste). Each
 * step's instruction names the menu items or, at higher difficulty, the shortcut keys.
 */
export function copyPasteSteps({ direction, route, number }: CopyPasteLevel, os: OsFamily): LessonStep[] {
  const say = (which: Say) => copyPasteSay(which, route, os);
  /** Point at the window to click first, then at the Edit menu. With shortcuts there is no menu to show. */
  const pointIn =
    (windowId: string) =>
    (state: DesktopState): HighlightTarget | null => {
      if (!isWindowFocused(state, windowId)) return { kind: 'title-bar', windowId };
      return route === 'menu' ? { kind: 'menu', menu: 'edit' } : null;
    };
  const copied = (from: string) => (_state: DesktopState, events: Parameters<LessonStep['done']>[1]) =>
    hasEvent(events, 'copied', (event) => event.windowId === from && event.text.trim() === number);
  // Copying something else is another try.
  const copiedElse =
    (from: string): LessonStep['wrong'] =>
    ({ events }) =>
      hasEvent(events, 'copied', (event) => event.windowId !== from || event.text.trim() !== number);

  // The number is only where the round put it. A child who clears the calculator or deletes the
  // number from the note cannot know it again, so the step starts over with the number back.
  const onClipboard = (clipboard: TextClipboard) => clipboard.read()?.text.trim() === number;
  if (direction === 'calculator-to-note') {
    const inCalculator = (state: DesktopState) => calculatorShows(state, number);
    return [
      {
        instruction: say('calculatorCopy'),
        done: copied(CALCULATOR_WINDOW),
        possible: inCalculator,
        wrong: copiedElse(CALCULATOR_WINDOW),
        hint: pointIn(CALCULATOR_WINDOW),
      },
      {
        instruction: say('notePaste'),
        done: (_state, events) =>
          hasEvent(events, 'pasted', (event) => event.windowId === NOTEPAD_WINDOW && event.text.includes(number)),
        wrong: pastedElse(NOTEPAD_WINDOW),
        possible: (state, clipboard) => onClipboard(clipboard) || inCalculator(state),
        hint: pointIn(NOTEPAD_WINDOW),
      },
    ];
  }
  const inNote = (state: DesktopState) => noteText(state).includes(number);
  return [
    {
      instruction: say('noteSelect'),
      done: (state) => noteSelection(state).trim() === number,
      possible: inNote,
      hint: pointIn(NOTEPAD_WINDOW),
    },
    {
      instruction: say('noteCopy'),
      done: copied(NOTEPAD_WINDOW),
      wrong: copiedElse(NOTEPAD_WINDOW),
      possible: inNote,
      hint: pointIn(NOTEPAD_WINDOW),
    },
    {
      instruction: say('calculatorPaste'),
      done: (state, events) =>
        hasEvent(events, 'pasted', (event) => event.windowId === CALCULATOR_WINDOW) && calculatorShows(state, number),
      wrong: pastedElse(CALCULATOR_WINDOW),
      possible: (state, clipboard) => onClipboard(clipboard) || inNote(state),
      hint: pointIn(CALCULATOR_WINDOW),
    },
  ];
}
