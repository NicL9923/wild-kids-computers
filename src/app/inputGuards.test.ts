// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createToyClipboard, installInputGuards, type ToyClipboard } from './inputGuards.ts';

let clipboard: ToyClipboard;
let uninstall: () => void;
let inputEvents: Array<{ inputType: string; data: string | null }> = [];

function recordInput(event: Event): void {
  if (event instanceof InputEvent) inputEvents.push({ inputType: event.inputType, data: event.data });
}

beforeEach(() => {
  clipboard = createToyClipboard();
  uninstall = installInputGuards(document, clipboard);
  inputEvents = [];
  document.addEventListener('input', recordInput);
});

afterEach(() => {
  document.removeEventListener('input', recordInput);
  uninstall();
  document.body.replaceChildren();
});

/** Fires a cancelable clipboard or drag event and reports whether the guard cancelled it. */
function fire(target: EventTarget, type: string): boolean {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function textField(value: string, start: number, end: number, type = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  document.body.append(input);
  input.setSelectionRange(start, end);
  return input;
}

describe('copy', () => {
  it('puts the selected text on the toy clipboard and keeps it off the system clipboard', () => {
    const input = textField('red fox', 4, 7);
    expect(fire(input, 'copy')).toBe(true);
    expect(clipboard.read()).toEqual({ kind: 'text', text: 'fox' });
    expect(input.value).toBe('red fox');
  });

  it('copies a selection of page text', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'blue jay';
    document.body.append(paragraph);
    const text = paragraph.firstChild;
    if (text === null) throw new Error('The paragraph has no text node.');
    document.getSelection()?.setBaseAndExtent(text, 0, text, 4);
    expect(fire(paragraph, 'copy')).toBe(true);
    expect(clipboard.read()).toEqual({ kind: 'text', text: 'blue' });
  });

  it('copies nothing from a password field', () => {
    const input = textField('secret', 0, 6, 'password');
    expect(fire(input, 'copy')).toBe(true);
    expect(clipboard.read()).toBeNull();
  });

  it('leaves the toy clipboard alone when nothing is selected', () => {
    clipboard.write({ kind: 'text', text: 'kept' });
    const input = textField('owl', 1, 1);
    fire(input, 'copy');
    expect(clipboard.read()).toEqual({ kind: 'text', text: 'kept' });
  });
});

describe('cut', () => {
  it('moves the selected text to the toy clipboard and reports an input', () => {
    const input = textField('red fox', 3, 7);
    expect(fire(input, 'cut')).toBe(true);
    expect(clipboard.read()).toEqual({ kind: 'text', text: ' fox' });
    expect(input.value).toBe('red');
    expect(inputEvents).toEqual([{ inputType: 'deleteByCut', data: null }]);
  });

  it('copies but does not delete from a read-only field', () => {
    const input = textField('moss', 0, 4);
    input.readOnly = true;
    fire(input, 'cut');
    expect(clipboard.read()).toEqual({ kind: 'text', text: 'moss' });
    expect(input.value).toBe('moss');
    expect(inputEvents).toEqual([]);
  });
});

describe('paste', () => {
  it('replaces the selection with the toy clipboard text and puts the cursor after it', () => {
    clipboard.write({ kind: 'text', text: 'big' });
    const textarea = document.createElement('textarea');
    textarea.value = 'a small bear';
    document.body.append(textarea);
    textarea.setSelectionRange(2, 7);
    expect(fire(textarea, 'paste')).toBe(true);
    expect(textarea.value).toBe('a big bear');
    expect(textarea.selectionStart).toBe(5);
    expect(inputEvents).toEqual([{ inputType: 'insertFromPaste', data: 'big' }]);
  });

  it('cancels a paste and inserts nothing when the toy clipboard is empty', () => {
    const input = textField('pond', 4, 4);
    expect(fire(input, 'paste')).toBe(true);
    expect(input.value).toBe('pond');
    expect(inputEvents).toEqual([]);
  });

  it('cancels a paste outside any text field', () => {
    clipboard.write({ kind: 'text', text: 'x' });
    expect(fire(document.body, 'paste')).toBe(true);
  });

  it('does not paste into a number field, which has no text selection', () => {
    clipboard.write({ kind: 'text', text: '5' });
    const input = textField('', 0, 0, 'text');
    input.type = 'number';
    expect(fire(input, 'paste')).toBe(true);
    expect(input.value).toBe('');
  });
});

describe('drag and drop', () => {
  it.each(['dragstart', 'dragover', 'drop'])('cancels every %s', (type) => {
    const image = document.createElement('img');
    document.body.append(image);
    expect(fire(image, type)).toBe(true);
  });
});

describe('file choosers', () => {
  it.each([
    ['a file input', 'file', true],
    ['a text field', 'text', false],
    ['a checkbox', 'checkbox', false],
  ])('cancels a click on %s only when it would open a file chooser', (_label, type, cancelled) => {
    const input = document.createElement('input');
    input.type = type;
    document.body.append(input);
    expect(fire(input, 'click')).toBe(cancelled);
  });
});

describe('uninstall', () => {
  it('removes every handler', () => {
    uninstall();
    const input = textField('fern', 0, 4);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    document.body.append(fileInput);
    expect(['copy', 'cut', 'paste', 'dragstart'].map((type) => fire(input, type))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(fire(fileInput, 'click')).toBe(false);
    expect(clipboard.read()).toBeNull();
  });
});

describe('toy clipboard', () => {
  it('tells subscribers about writes and clears until they unsubscribe', () => {
    const toy = createToyClipboard();
    const seen: Array<string | null> = [];
    const unsubscribe = toy.subscribe((content) => seen.push(content?.text ?? null));
    toy.write({ kind: 'text', text: 'one' });
    toy.clear();
    unsubscribe();
    toy.write({ kind: 'text', text: 'two' });
    expect(seen).toEqual(['one', null]);
    expect(toy.read()).toEqual({ kind: 'text', text: 'two' });
  });

  it('keeps its own copy of what was written', () => {
    const toy = createToyClipboard();
    const content = { kind: 'text' as const, text: 'one' };
    toy.write(content);
    content.text = 'changed';
    expect(toy.read()?.text).toBe('one');
  });
});
