import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../app/inputGuards.ts';
import {
  applyTextOp,
  canRedo,
  canUndo,
  createEditor,
  MAX_UNDO_STEPS,
  selectedText,
  setEditorText,
  type CaretMove,
  type TextEditorState,
  type TextOp,
} from './textEditor.ts';

function run(editor: TextEditorState, ...ops: TextOp[]): TextEditorState {
  const clipboard = createToyClipboard();
  return ops.reduce((current, op) => applyTextOp(current, op, clipboard).editor, editor);
}

function type(editor: TextEditorState, text: string): TextEditorState {
  return run(editor, ...Array.from(text, (character): TextOp => ({ type: 'insert', text: character })));
}

const at = (text: string, anchor: number, caret = anchor, multiline = true): TextEditorState => ({
  ...createEditor({ text, multiline }),
  anchor,
  caret,
});

const move = (to: CaretMove, extend = false): TextOp => ({ type: 'move', move: to, extend });

describe('createEditor', () => {
  it('puts the caret at the end with no history', () => {
    const editor = createEditor({ text: 'hello' });
    expect(editor).toMatchObject({ text: 'hello', anchor: 5, caret: 5, undo: [], redo: [] });
  });

  it('turns line breaks into spaces in a one-line field and cuts text to the limit', () => {
    expect(createEditor({ text: 'a\nb\r\nc', multiline: false }).text).toBe('a b c');
    expect(createEditor({ text: 'a\r\nb', multiline: true }).text).toBe('a\nb');
    expect(createEditor({ text: 'abcdef', maxLength: 3 }).text).toBe('abc');
  });

  it('starts history over when the whole text is replaced', () => {
    const typed = type(createEditor({ multiline: true }), 'abc');
    const replaced = setEditorText(typed, 'new');
    expect(replaced).toMatchObject({ text: 'new', caret: 3, multiline: true });
    expect(canUndo(replaced)).toBe(false);
  });
});

describe('typing and deleting', () => {
  it('types at the caret and replaces a selection', () => {
    expect(run(at('cat', 1), { type: 'insert', text: 'h' })).toMatchObject({ text: 'chat', caret: 2, anchor: 2 });
    expect(run(at('cat', 0, 3), { type: 'insert', text: 'dog' })).toMatchObject({ text: 'dog', caret: 3 });
  });

  it('ignores Enter in a one-line field, even over a selection', () => {
    const editor = at('name', 0, 4, false);
    const result = applyTextOp(editor, { type: 'insert', text: '\n' }, createToyClipboard());
    expect(result.changed).toBe(false);
    expect(result.editor.text).toBe('name');
  });

  it('types a line break in a notepad', () => {
    expect(run(at('ab', 1), { type: 'insert', text: '\n' }).text).toBe('a\nb');
  });

  it.each([
    ['Backspace deletes before the caret', at('cat', 2), { type: 'backspace' }, 'ct', 1],
    ['Delete deletes after the caret', at('cat', 1), { type: 'delete' }, 'ct', 1],
    ['Backspace deletes a selection', at('catalog', 1, 4), { type: 'backspace' }, 'clog', 1],
    ['Delete deletes a selection', at('catalog', 4, 1), { type: 'delete' }, 'clog', 1],
  ] as const)('%s', (_label, editor, op, text, caret) => {
    expect(run(editor, op)).toMatchObject({ text, caret, anchor: caret });
  });

  it.each([
    ['Backspace at the start', at('cat', 0), { type: 'backspace' }],
    ['Delete at the end', at('cat', 3), { type: 'delete' }],
  ] as const)('changes nothing for %s', (_label, editor, op) => {
    const result = applyTextOp(editor, op, createToyClipboard());
    expect(result.changed).toBe(false);
    expect(canUndo(result.editor)).toBe(false);
  });

  it('stops typing at the length limit and says so', () => {
    const editor = { ...createEditor({ text: 'abc', maxLength: 3 }) };
    const result = applyTextOp(editor, { type: 'insert', text: 'd' }, createToyClipboard());
    expect(result).toMatchObject({ changed: false, hitLimit: true, editor: { text: 'abc' } });
  });

  it('lets typing replace a selection at the length limit', () => {
    const editor = { ...createEditor({ text: 'abc', maxLength: 3 }), anchor: 0, caret: 1 };
    const result = applyTextOp(editor, { type: 'insert', text: 'z' }, createToyClipboard());
    expect(result).toMatchObject({ changed: true, hitLimit: false, editor: { text: 'zbc' } });
  });
});

describe('emoji', () => {
  const fox = '🦊';

  it('moves, deletes, and selects an emoji as one character', () => {
    const editor = at(`a${fox}b`, 1);
    expect(run(editor, move('right')).caret).toBe(3);
    expect(run(at(`a${fox}b`, 3), move('left')).caret).toBe(1);
    expect(run(at(`a${fox}b`, 3), { type: 'backspace' }).text).toBe('ab');
    expect(run(at(`a${fox}b`, 1), { type: 'delete' }).text).toBe('ab');
  });

  it('never leaves a pointer selection inside an emoji', () => {
    const editor = run(at(`a${fox}b`, 0), { type: 'select', anchor: 2, caret: 2 });
    expect(editor.caret).toBe(1);
  });

  it('counts an emoji as one character against the limit', () => {
    const editor = createEditor({ text: 'ab', maxLength: 3 });
    expect(type(editor, fox).text).toBe(`ab${fox}`);
  });
});

describe('caret movement', () => {
  const lines = 'one\ntwo three\nsix';

  it.each([
    ['left', at('abc', 2), move('left'), 1, 1],
    ['right', at('abc', 2), move('right'), 3, 3],
    ['left at the start stays', at('abc', 0), move('left'), 0, 0],
    ['right at the end stays', at('abc', 3), move('right'), 3, 3],
    ['left collapses a selection to its start', at('abcdef', 4, 1), move('left'), 1, 1],
    ['right collapses a selection to its end', at('abcdef', 1, 4), move('right'), 4, 4],
    ['Shift left grows the selection', at('abcdef', 4, 4), move('left', true), 4, 3],
    ['Shift right shrinks a backward selection', at('abcdef', 4, 1), move('right', true), 4, 2],
    ['up keeps the column', at(lines, 6), move('up'), 2, 2],
    ['up clamps the column to a short line', at(lines, 13), move('up'), 3, 3],
    ['up on the first line goes to the start', at(lines, 2), move('up'), 0, 0],
    ['down keeps the column', at(lines, 1), move('down'), 5, 5],
    ['down clamps the column to a short line', at(lines, 12), move('down'), 17, 17],
    ['down on the last line goes to the end', at(lines, 15), move('down'), 17, 17],
    ['Shift down selects to the next line', at(lines, 1), move('down', true), 1, 5],
    ['line start', at(lines, 8), move('line-start'), 4, 4],
    ['line end', at(lines, 5), move('line-end'), 13, 13],
    ['Shift line end selects to the end of the line', at(lines, 5), move('line-end', true), 5, 13],
    ['text start', at(lines, 8), move('text-start'), 0, 0],
    ['text end', at(lines, 8), move('text-end'), 17, 17],
  ] as const)('%s', (_label, editor, op, anchor, caret) => {
    expect(run(editor, op)).toMatchObject({ anchor, caret });
  });

  it('clamps a pointer selection to the text', () => {
    expect(run(at('abc', 0), { type: 'select', anchor: -5, caret: 99 })).toMatchObject({ anchor: 0, caret: 3 });
  });

  it('selects all and reads the selected text', () => {
    const editor = run(at('hello', 2), { type: 'select-all' });
    expect(editor).toMatchObject({ anchor: 0, caret: 5 });
    expect(selectedText(editor)).toBe('hello');
  });
});

describe('clipboard', () => {
  it('copies the selection without changing the text', () => {
    const clipboard = createToyClipboard();
    const result = applyTextOp(at('hello world', 6, 11), { type: 'copy' }, clipboard);
    expect(result).toMatchObject({ changed: false, copied: 'world', editor: { text: 'hello world' } });
    expect(clipboard.read()).toEqual({ kind: 'text', text: 'world' });
  });

  it('leaves the clipboard alone when copy or cut has nothing selected', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'kept' });
    applyTextOp(at('hello', 2), { type: 'copy' }, clipboard);
    const cut = applyTextOp(at('hello', 2), { type: 'cut' }, clipboard);
    expect(cut.changed).toBe(false);
    expect(clipboard.read()?.text).toBe('kept');
  });

  it('cuts the selection to the clipboard as one undo step', () => {
    const clipboard = createToyClipboard();
    const cut = applyTextOp(at('hello world', 5, 11), { type: 'cut' }, clipboard);
    expect(cut).toMatchObject({ changed: true, copied: ' world', editor: { text: 'hello', caret: 5 } });
    expect(clipboard.read()?.text).toBe(' world');
    expect(applyTextOp(cut.editor, { type: 'undo' }, clipboard).editor).toMatchObject({
      text: 'hello world',
      anchor: 5,
      caret: 11,
    });
  });

  it('pastes over the selection and reports what it pasted', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'big' });
    const result = applyTextOp(at('a small dog', 2, 7), { type: 'paste' }, clipboard);
    expect(result).toMatchObject({ changed: true, pasted: 'big', editor: { text: 'a big dog', caret: 5 } });
  });

  it('pastes nothing from an empty clipboard', () => {
    const result = applyTextOp(at('abc', 1), { type: 'paste' }, createToyClipboard());
    expect(result).toMatchObject({ changed: false, editor: { text: 'abc' } });
    expect(result.pasted).toBeUndefined();
  });

  it('turns pasted line breaks into spaces in a one-line field', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'two\nlines' });
    expect(applyTextOp(at('', 0, 0, false), { type: 'paste' }, clipboard).editor.text).toBe('two lines');
  });

  it('cuts a paste short at the length limit and says so', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'abcdef' });
    const editor = createEditor({ text: 'xy', maxLength: 5 });
    const result = applyTextOp(editor, { type: 'paste' }, clipboard);
    expect(result).toMatchObject({ changed: true, hitLimit: true, pasted: 'abc', editor: { text: 'xyabc' } });
  });

  it('pastes nothing into a full field and reports an empty paste', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'more' });
    const result = applyTextOp(createEditor({ text: 'full', maxLength: 4 }), { type: 'paste' }, clipboard);
    expect(result).toMatchObject({ changed: false, hitLimit: true, pasted: '' });
  });
});

describe('undo and redo', () => {
  it('undoes typing one word at a time', () => {
    const typed = type(createEditor({ multiline: true }), 'hi there you');
    const once = run(typed, { type: 'undo' });
    const twice = run(once, { type: 'undo' });
    expect(once.text).toBe('hi there ');
    expect(twice.text).toBe('hi ');
    expect(run(twice, { type: 'undo' }).text).toBe('');
  });

  it('starts a new step after a line break, too', () => {
    const typed = type(createEditor({ multiline: true }), 'ab\ncd');
    expect(run(typed, { type: 'undo' }).text).toBe('ab\n');
  });

  it('starts a new step after the caret moves', () => {
    const typed = run(type(createEditor({ multiline: true }), 'ab'), move('left'), { type: 'insert', text: 'x' });
    expect(typed.text).toBe('axb');
    expect(run(typed, { type: 'undo' }).text).toBe('ab');
  });

  it('starts a new step when typing replaces a selection', () => {
    const typed = run(type(createEditor(), 'abc'), { type: 'select-all' }, { type: 'insert', text: 'z' });
    expect(run(typed, { type: 'undo' })).toMatchObject({ text: 'abc', anchor: 0, caret: 3 });
  });

  it('groups a run of Backspace presses into one step', () => {
    const deleted = run(
      createEditor({ text: 'hello' }),
      { type: 'backspace' },
      { type: 'backspace' },
      { type: 'backspace' },
    );
    expect(deleted.text).toBe('he');
    expect(run(deleted, { type: 'undo' }).text).toBe('hello');
  });

  it('keeps typing and deleting in separate steps', () => {
    const edited = run(type(createEditor(), 'ab'), { type: 'backspace' });
    expect(run(edited, { type: 'undo' }).text).toBe('ab');
  });

  it('keeps a paste in its own step', () => {
    const clipboard = createToyClipboard();
    clipboard.write({ kind: 'text', text: 'XY' });
    let editor = type(createEditor(), 'ab');
    editor = applyTextOp(editor, { type: 'paste' }, clipboard).editor;
    editor = applyTextOp(editor, { type: 'insert', text: 'c' }, clipboard).editor;
    expect(editor.text).toBe('abXYc');
    expect(run(editor, { type: 'undo' }).text).toBe('abXY');
    expect(run(editor, { type: 'undo' }, { type: 'undo' }).text).toBe('ab');
  });

  it('redoes what undo took back and restores the caret', () => {
    const typed = type(createEditor(), 'cat');
    const undone = run(typed, { type: 'undo' });
    expect(canRedo(undone)).toBe(true);
    expect(run(undone, { type: 'redo' })).toMatchObject({ text: 'cat', caret: 3 });
  });

  it('forgets redo after a new edit', () => {
    const edited = run(type(createEditor(), 'cat'), { type: 'undo' }, { type: 'insert', text: 'd' });
    expect(canRedo(edited)).toBe(false);
    expect(applyTextOp(edited, { type: 'redo' }, createToyClipboard()).changed).toBe(false);
  });

  it('changes nothing when there is nothing to undo', () => {
    expect(applyTextOp(createEditor({ text: 'a' }), { type: 'undo' }, createToyClipboard()).changed).toBe(false);
  });

  it('keeps the newest steps once history is full', () => {
    let editor = createEditor({ multiline: true });
    // Each word is one step: "w" starts it and the space joins it.
    for (let index = 0; index < MAX_UNDO_STEPS + 5; index += 1) editor = type(editor, 'w ');
    expect(editor.undo).toHaveLength(MAX_UNDO_STEPS);
    let undone = editor;
    for (let index = 0; index < MAX_UNDO_STEPS; index += 1) undone = run(undone, { type: 'undo' });
    expect(canUndo(undone)).toBe(false);
    expect(undone.text).toBe('w '.repeat(5));
  });
});

describe('editor edges', () => {
  it.each([
    ['the first character past the basic plane', '\u{10000}', 2],
    ['the last character there is', '\u{10FFFF}', 2],
    ['the last character before the surrogates', '퟿', 1],
    ['the first private use character after them', '', 1],
  ])('steps over %s as one character', (_label, character, width) => {
    const text = `a${character}b`;
    expect(run(at(text, 1), move('right')).caret).toBe(1 + width);
    expect(run(at(text, 1 + width), move('left')).caret).toBe(1);
  });

  it('replaces a lone surrogate, so the caret never lands past the text', () => {
    const editor = createEditor({ text: 'a\uD83E', multiline: true });
    expect(editor.text).toBe('a�');
    expect(run({ ...editor, anchor: 1, caret: 1 }, move('right')).caret).toBe(2);
  });

  it('makes a one-line field unless told otherwise', () => {
    expect(run(createEditor(), { type: 'insert', text: '\n' }).text).toBe('');
  });

  it('turns a lone carriage return into a line break', () => {
    expect(createEditor({ text: 'a\rb', multiline: true }).text).toBe('a\nb');
  });

  it('reports no paste for typing', () => {
    const result = applyTextOp(createEditor(), { type: 'insert', text: 'a' }, createToyClipboard());
    expect(result.pasted).toBeUndefined();
    expect(result.changed).toBe(true);
  });

  it('reports a change for each Backspace in a run', () => {
    const once = applyTextOp(createEditor({ text: 'abc' }), { type: 'backspace' }, createToyClipboard());
    const twice = applyTextOp(once.editor, { type: 'backspace' }, createToyClipboard());
    expect(twice).toMatchObject({ changed: true, editor: { text: 'a' } });
  });

  it('undoes again after a redo', () => {
    const typed = type(createEditor(), 'cat');
    const back = run(typed, { type: 'undo' }, { type: 'redo' }, { type: 'undo' });
    expect(back.text).toBe('');
    expect(canRedo(back)).toBe(true);
  });

  it('joins typed text that starts with a space to the word before it', () => {
    const typed = run(type(createEditor({ multiline: true }), 'a'), { type: 'insert', text: ' z' });
    expect(run(typed, { type: 'undo' }).text).toBe('');
  });

  it('groups by what is before the caret, not by the end of the text', () => {
    // Text after the caret ends with a space, which must not split the word being typed.
    const editor = { ...createEditor({ text: 'x ', multiline: true }), anchor: 0, caret: 0 };
    const typed = run(editor, { type: 'insert', text: 'a' }, { type: 'insert', text: 'b' });
    expect(typed.text).toBe('abx ');
    expect(run(typed, { type: 'undo' }).text).toBe('x ');
  });
});
