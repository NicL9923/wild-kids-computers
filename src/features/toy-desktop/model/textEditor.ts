/**
 * The text editing model the notepad and every toy text field share: text, caret, selection,
 * keyboard editing, the toy clipboard, and undo with typed runs grouped by word.
 *
 * Positions are UTF-16 offsets, as in the DOM. The caret never stops inside a surrogate pair,
 * so an emoji moves and deletes as one character.
 */
import type { ToyClipboard } from '../../../app/inputGuards.ts';

/** The app's toy clipboard, or any stand-in with the same read and write. */
export type TextClipboard = Pick<ToyClipboard, 'read' | 'write'>;

/** How many undo steps a text keeps. Older steps drop off. */
export const MAX_UNDO_STEPS = 100;

export interface TextSnapshot {
  text: string;
  /** Where the selection started. Equal to `caret` when nothing is selected. */
  anchor: number;
  caret: number;
}

export interface TextEditorState extends TextSnapshot {
  /** False for a one-line field: Enter types nothing and pasted line breaks become spaces. */
  multiline: boolean;
  /** The longest text, in characters. */
  maxLength: number;
  /** The text before each undo step, oldest first. */
  undo: TextSnapshot[];
  /** Steps that undo took back, most recent last. */
  redo: TextSnapshot[];
  /** While the child keeps typing or deleting, each key joins the same undo step. */
  run: 'typing' | 'deleting' | null;
}

export type CaretMove =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  /** Home: the start of the line. */
  | 'line-start'
  /** End: the end of the line. */
  | 'line-end'
  /** Primary modifier with Home or the up arrow, depending on the computer. */
  | 'text-start'
  | 'text-end';

/** Keyboard and pointer editing. */
export type TextEditOp =
  /** Typed text, usually one character. Enter types "\n". */
  | { type: 'insert'; text: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  /** A caret move. With `extend`, as with Shift held, the selection grows or shrinks instead. */
  | { type: 'move'; move: CaretMove; extend: boolean }
  /** A pointer selection or caret placement. Out-of-range offsets clamp. */
  | { type: 'select'; anchor: number; caret: number };

/** The standard edit commands, which every app runs the same way. */
export type TextCommandOp =
  | { type: 'select-all' }
  | { type: 'cut' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'undo' }
  | { type: 'redo' };

export type TextOp = TextEditOp | TextCommandOp;

export interface TextOpResult {
  editor: TextEditorState;
  /** True when the text changed. A caret move changes no text. */
  changed: boolean;
  /** Text written to the clipboard by copy or cut. */
  copied?: string;
  /** Text read from the clipboard by paste, after line breaks and length limits. */
  pasted?: string;
  /** True when the text was cut short at `maxLength`. */
  hitLimit?: boolean;
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Moves an offset off the middle of a surrogate pair, toward the start. */
function snap(text: string, offset: number): number {
  const clamped = Math.min(Math.max(Math.trunc(offset), 0), text.length);
  return clamped > 0 &&
    clamped < text.length &&
    isLowSurrogate(text.charCodeAt(clamped)) &&
    isHighSurrogate(text.charCodeAt(clamped - 1))
    ? clamped - 1
    : clamped;
}

function previousOffset(text: string, offset: number): number {
  if (offset <= 0) return 0;
  return snap(text, offset - 1);
}

function nextOffset(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  return isHighSurrogate(text.charCodeAt(offset)) && isLowSurrogate(text.charCodeAt(offset + 1))
    ? offset + 2
    : offset + 1;
}

export interface EditorOptions {
  text?: string;
  multiline?: boolean;
  maxLength?: number;
}

/** A new editor with the caret at the end of the text and no history. */
export function createEditor({ text = '', multiline = false, maxLength = 2000 }: EditorOptions = {}): TextEditorState {
  const clean = limit(normalize(text, multiline), maxLength).text;
  return {
    text: clean,
    anchor: clean.length,
    caret: clean.length,
    multiline,
    maxLength,
    undo: [],
    redo: [],
    run: null,
  };
}

/** Replaces the whole text, as when a file opens. History starts over. */
export function setEditorText(editor: TextEditorState, text: string): TextEditorState {
  return createEditor({ text, multiline: editor.multiline, maxLength: editor.maxLength });
}

/** The selection as `[start, end]`, start first. */
export function selectionRange(editor: TextSnapshot): [number, number] {
  return [Math.min(editor.anchor, editor.caret), Math.max(editor.anchor, editor.caret)];
}

export function hasSelection(editor: TextSnapshot): boolean {
  return editor.anchor !== editor.caret;
}

export function selectedText(editor: TextSnapshot): string {
  const [start, end] = selectionRange(editor);
  return editor.text.slice(start, end);
}

export function canUndo(editor: TextEditorState): boolean {
  return editor.undo.length > 0;
}

export function canRedo(editor: TextEditorState): boolean {
  return editor.redo.length > 0;
}

function normalize(text: string, multiline: boolean): string {
  const unified = text.replace(/\r\n?/g, '\n');
  return multiline ? unified : unified.replace(/\n/g, ' ');
}

/** Cuts text to fit in `room` characters without splitting a surrogate pair. */
function limit(text: string, room: number): { text: string; cut: boolean } {
  if (codePointLength(text) <= room) return { text, cut: false };
  return { text: Array.from(text).slice(0, Math.max(room, 0)).join(''), cut: true };
}

function snapshot(editor: TextEditorState): TextSnapshot {
  return { text: editor.text, anchor: editor.anchor, caret: editor.caret };
}

/** Records the current text as an undo step, unless this edit joins the open run. */
function pushUndo(
  editor: TextEditorState,
  run: TextEditorState['run'],
  joins: boolean,
): Pick<TextEditorState, 'undo' | 'redo' | 'run'> {
  if (joins) return { undo: editor.undo, redo: [], run };
  return { undo: [...editor.undo, snapshot(editor)].slice(-MAX_UNDO_STEPS), redo: [], run };
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const end = text.indexOf('\n', offset);
  return end === -1 ? text.length : end;
}

function verticalTarget(text: string, caret: number, direction: 'up' | 'down'): number {
  const start = lineStart(text, caret);
  const column = caret - start;
  if (direction === 'up') {
    if (start === 0) return 0;
    const previousStart = lineStart(text, start - 1);
    return snap(text, Math.min(previousStart + column, start - 1));
  }
  const end = lineEnd(text, caret);
  if (end === text.length) return text.length;
  return snap(text, Math.min(end + 1 + column, lineEnd(text, end + 1)));
}

function moveCaret(editor: TextEditorState, move: CaretMove, extend: boolean): number {
  const { text, caret } = editor;
  const [start, end] = selectionRange(editor);
  const collapsing = !extend && start !== end;
  switch (move) {
    case 'left':
      return collapsing ? start : previousOffset(text, caret);
    case 'right':
      return collapsing ? end : nextOffset(text, caret);
    case 'up':
      return verticalTarget(text, caret, 'up');
    case 'down':
      return verticalTarget(text, caret, 'down');
    case 'line-start':
      return lineStart(text, caret);
    case 'line-end':
      return lineEnd(text, caret);
    case 'text-start':
      return 0;
    // 'text-end', the last case.
    default:
      return text.length;
  }
}

/** Replaces the selection with `inserted` and puts the caret after it. */
function replaceSelection(editor: TextEditorState, inserted: string): TextSnapshot {
  const [start, end] = selectionRange(editor);
  const text = editor.text.slice(0, start) + inserted + editor.text.slice(end);
  const caret = start + inserted.length;
  return { text, anchor: caret, caret };
}

function unchanged(editor: TextEditorState, extra: Partial<TextOpResult> = {}): TextOpResult {
  return { editor, changed: false, ...extra };
}

function insert(editor: TextEditorState, raw: string, kind: 'typing' | 'paste'): TextOpResult {
  const normalized = normalize(raw, editor.multiline);
  // In a one-line field Enter is for the screen, such as a dialog's confirm button.
  const typed = kind === 'typing' && !editor.multiline ? raw.replace(/[\r\n]/g, '') : normalized;
  if (typed === '') return unchanged(editor);
  const [start, end] = selectionRange(editor);
  const room = editor.maxLength - (codePointLength(editor.text) - codePointLength(editor.text.slice(start, end)));
  const fitted = limit(typed, room);
  const pasted = kind === 'paste' ? { pasted: fitted.text } : {};
  if (fitted.text === '' && start === end) return unchanged(editor, { hitLimit: fitted.cut, ...pasted });
  const before = editor.text.slice(0, start);
  // A typed run joins the open step until a new word starts after a space or line break.
  const startsWord = /\s$/.test(before) && /^\S/.test(fitted.text);
  const joins = kind === 'typing' && editor.run === 'typing' && start === end && !startsWord;
  const next = replaceSelection(editor, fitted.text);
  const history = pushUndo(editor, kind === 'typing' ? 'typing' : null, joins);
  return { editor: { ...editor, ...next, ...history }, changed: true, hitLimit: fitted.cut, ...pasted };
}

function deleteRange(editor: TextEditorState, direction: 'back' | 'forward'): TextOpResult {
  if (hasSelection(editor)) {
    const next = replaceSelection(editor, '');
    return { editor: { ...editor, ...next, ...pushUndo(editor, null, false) }, changed: true };
  }
  const { text, caret } = editor;
  const from = direction === 'back' ? previousOffset(text, caret) : caret;
  const to = direction === 'back' ? caret : nextOffset(text, caret);
  if (from === to) return unchanged(editor);
  const joins = editor.run === 'deleting';
  const next = { text: text.slice(0, from) + text.slice(to), anchor: from, caret: from };
  return { editor: { ...editor, ...next, ...pushUndo(editor, 'deleting', joins) }, changed: true };
}

function restore(editor: TextEditorState, from: 'undo' | 'redo'): TextOpResult {
  const stack = editor[from];
  const target = stack.at(-1);
  if (target === undefined) return unchanged(editor);
  const other = from === 'undo' ? 'redo' : 'undo';
  return {
    editor: {
      ...editor,
      ...target,
      [from]: stack.slice(0, -1),
      [other]: [...editor[other], snapshot(editor)],
      run: null,
    },
    changed: true,
  };
}

/** Applies one editing operation. Copy and cut write the clipboard; paste reads it. */
export function applyTextOp(editor: TextEditorState, op: TextOp, clipboard: TextClipboard): TextOpResult {
  switch (op.type) {
    case 'insert':
      return insert(editor, op.text, 'typing');
    case 'backspace':
      return deleteRange(editor, 'back');
    case 'delete':
      return deleteRange(editor, 'forward');
    case 'move': {
      const caret = moveCaret(editor, op.move, op.extend);
      const anchor = op.extend ? editor.anchor : caret;
      return unchanged({ ...editor, anchor, caret, run: null });
    }
    case 'select':
      return unchanged({
        ...editor,
        anchor: snap(editor.text, op.anchor),
        caret: snap(editor.text, op.caret),
        run: null,
      });
    case 'select-all':
      return unchanged({ ...editor, anchor: 0, caret: editor.text.length, run: null });
    case 'copy':
    case 'cut': {
      const text = selectedText(editor);
      if (text === '') return unchanged(editor);
      clipboard.write({ kind: 'text', text });
      if (op.type === 'copy') return unchanged({ ...editor, run: null }, { copied: text });
      return { ...deleteRange(editor, 'back'), copied: text };
    }
    case 'paste': {
      const content = clipboard.read();
      if (content === null || content.text === '') return unchanged(editor);
      return insert(editor, content.text, 'paste');
    }
    case 'undo':
      return restore(editor, 'undo');
    // 'redo', the last case.
    default:
      return restore(editor, 'redo');
  }
}
