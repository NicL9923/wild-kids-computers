import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { applyTextOp, createEditor, type TextOp } from '../../../toy-desktop/model/textEditor.ts';
import activity from './activity.ts';
import { generateLevel } from './level.ts';
import { howToPress, SHORTCUT_TEXT, stepInstruction } from './speech.ts';
import { STEPS, tidyLines, type NoteState, type StepId, type WorkshopStep } from './steps.ts';
import { strings } from './strings.ts';

/** A child's keys for a step, as editing operations, with 'save' for the save shortcut. */
type Move = TextOp | 'save';

/** Plays moves through the real text model and the step's own starting state. */
function play(step: WorkshopStep, moves: readonly Move[]): NoteState {
  const clipboard = createToyClipboard();
  if (step.clipboard !== null) clipboard.write({ kind: 'text', text: step.clipboard });
  const [anchor, caret] = step.selection;
  const undo = step.history.map((text) => ({ text, anchor: text.length, caret: text.length }));
  let editor = { ...createEditor({ text: step.text, multiline: true }), anchor, caret, undo };
  let saved: string | null = step.saved ? step.text : null;
  for (const move of moves) {
    if (move === 'save') saved = editor.text;
    else editor = applyTextOp(editor, move, clipboard).editor;
  }
  return {
    text: editor.text,
    anchor: editor.anchor,
    caret: editor.caret,
    clipboard: clipboard.read()?.text ?? null,
    saved: saved === editor.text,
    undone: editor.redo.length,
  };
}

const step = (id: StepId): WorkshopStep => {
  const found = STEPS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No step ${id}`);
  return found;
};

const toStart: TextOp = { type: 'move', move: 'text-start', extend: false };
const toEnd: TextOp = { type: 'move', move: 'text-end', extend: false };

/** The shortest way through each step, with the shortcuts it teaches. */
const SOLUTIONS: Readonly<Record<StepId, readonly Move[]>> = {
  'select-all': [{ type: 'select-all' }],
  copy: [{ type: 'copy' }],
  paste: [{ type: 'paste' }],
  cut: [{ type: 'cut' }],
  undo: [{ type: 'undo' }],
  save: ['save'],
  'copy-and-paste': [{ type: 'copy' }, toEnd, { type: 'paste' }],
  'cut-and-paste': [{ type: 'cut' }, toStart, { type: 'paste' }],
  'undo-twice': [{ type: 'undo' }, { type: 'undo' }],
  'all-together': [
    { type: 'move', move: 'line-end', extend: true },
    { type: 'copy' },
    toEnd,
    { type: 'paste' },
    'save',
  ],
};

describe('the steps', () => {
  it('are about ten, each with its own id, and teach every shortcut the brief names', () => {
    expect(STEPS).toHaveLength(10);
    expect(new Set(STEPS.map((entry) => entry.id)).size).toBe(STEPS.length);
    expect(new Set(STEPS.flatMap((entry) => entry.teach))).toEqual(
      new Set(['select-all', 'copy', 'cut', 'paste', 'undo', 'save']),
    );
    expect(activity.kind === 'sequence' ? activity.steps : []).toBe(STEPS);
  });

  it.each(STEPS.map((entry) => [entry.id, entry] as const))('%s is not done at the start', (_id, entry) => {
    expect(entry.done(play(entry, []))).toBe(false);
  });

  it.each(STEPS.map((entry) => [entry.id, entry] as const))('%s is done by its own shortcuts', (id, entry) => {
    expect(entry.done(play(entry, SOLUTIONS[id]))).toBe(true);
  });

  it.each([
    ['copy', [{ type: 'select-all' }, { type: 'copy' }]],
    ['paste', [toStart, { type: 'paste' }]],
    ['cut', [{ type: 'copy' }]],
    ['undo', [{ type: 'insert', text: ' snack' }]],
    ['save', [{ type: 'insert', text: '!' }, 'save', { type: 'backspace' }]],
    ['cut-and-paste', [{ type: 'cut' }, { type: 'paste' }]],
    ['undo-twice', [{ type: 'undo' }]],
    ['undo-twice', [{ type: 'insert', text: ' big red' }]],
    ['all-together', [{ type: 'move', move: 'line-end', extend: true }, { type: 'copy' }, toEnd, { type: 'paste' }]],
  ] as const)('%s is not done by a near miss', (id, moves) => {
    expect(step(id).done(play(step(id), moves))).toBe(false);
  });

  it('counts a pasted line with or without its line break, and tidy spaces', () => {
    expect(tidyLines('a  b\n\n c \n')).toEqual(['a b', 'c']);
    const withBreak = play(step('all-together'), [
      { type: 'move', move: 'down', extend: true },
      { type: 'copy' },
      toEnd,
      { type: 'paste' },
      'save',
    ]);
    expect(step('all-together').done(withBreak)).toBe(true);
  });

  it('starts every selection and caret inside the note', () => {
    for (const entry of STEPS) {
      for (const offset of entry.selection) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(entry.text.length);
      }
    }
  });
});

describe('generateLevel', () => {
  it('gives the step at each index, whatever the seed and band', () => {
    STEPS.forEach((entry, index) => {
      expect(generateLevel(5, index, 'band-9-12')).toBe(entry);
    });
  });

  it.each([-1, STEPS.length, 0.5])('rejects step %s', (index) => {
    expect(() => generateLevel(1, index, 'band-9-12')).toThrow(/steps 0 to 9, not/);
  });
});

describe('speech', () => {
  it.each([
    ['copy', 'linux', strings.copyCtrl],
    ['copy', 'windows', strings.copyCtrl],
    ['copy', 'mac', strings.copyCmd],
    ['save', 'mac', strings.saveCmd],
    ['select-all', 'linux', strings.selectAllCtrl],
  ] as const)('tells how to press %s on %s', (shortcut, os, handle) => {
    expect(howToPress(shortcut, os)).toBe(handle);
  });

  it('names Ctrl on Windows and Linux and Command on a Mac, with the key the text shows', () => {
    for (const [shortcut, text] of Object.entries(SHORTCUT_TEXT)) {
      expect(text.ctrl.text, shortcut).toBe(`Hold Ctrl and press ${text.key}.`);
      expect(text.command.text, shortcut).toBe(`Hold Command and press ${text.key}.`);
    }
  });

  it('says what a step asks, then how to press each of its shortcuts', () => {
    expect(stepInstruction(step('copy-and-paste'), 'mac')).toEqual([
      strings.stepCopyPaste,
      strings.copyCmd,
      strings.pasteCmd,
    ]);
  });
});
