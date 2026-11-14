import type { OsFamily } from '../../../../core/platform/bridge.ts';
import type { SpokenHandle, StringHandle } from '../../../../core/strings/defineStrings.ts';
import type { ShortcutId, StepId } from './steps.ts';
import { strings } from './strings.ts';

/** What each step asks, before its shortcuts. */
const STEP_SAYS: Readonly<Record<StepId, SpokenHandle>> = {
  'select-all': strings.stepSelectAll,
  copy: strings.stepCopy,
  paste: strings.stepPaste,
  cut: strings.stepCut,
  undo: strings.stepUndo,
  save: strings.stepSave,
  'copy-and-paste': strings.stepCopyPaste,
  'cut-and-paste': strings.stepCutPaste,
  'undo-twice': strings.stepUndoTwice,
  'all-together': strings.stepTogether,
};

interface ShortcutText {
  /** The letter key, as printed on the key cap. */
  readonly key: string;
  readonly name: StringHandle;
  readonly ctrl: SpokenHandle;
  readonly command: SpokenHandle;
}

export const SHORTCUT_TEXT: Readonly<Record<ShortcutId, ShortcutText>> = {
  'select-all': { key: 'A', name: strings.nameSelectAll, ctrl: strings.selectAllCtrl, command: strings.selectAllCmd },
  copy: { key: 'C', name: strings.nameCopy, ctrl: strings.copyCtrl, command: strings.copyCmd },
  cut: { key: 'X', name: strings.nameCut, ctrl: strings.cutCtrl, command: strings.cutCmd },
  paste: { key: 'V', name: strings.namePaste, ctrl: strings.pasteCtrl, command: strings.pasteCmd },
  undo: { key: 'Z', name: strings.nameUndo, ctrl: strings.undoCtrl, command: strings.undoCmd },
  save: { key: 'S', name: strings.nameSave, ctrl: strings.saveCtrl, command: strings.saveCmd },
};

/** How to press a shortcut on this computer: Command on a Mac, Ctrl elsewhere. */
export function howToPress(shortcut: ShortcutId, os: OsFamily): SpokenHandle {
  const text = SHORTCUT_TEXT[shortcut];
  return os === 'mac' ? text.command : text.ctrl;
}

/** What a step says: what to do, then how to press each of its shortcuts. */
export function stepInstruction(step: { id: StepId; teach: readonly ShortcutId[] }, os: OsFamily): SpokenHandle[] {
  return [STEP_SAYS[step.id], ...step.teach.map((shortcut) => howToPress(shortcut, os))];
}
