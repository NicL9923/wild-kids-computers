// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMenuCommand } from './menuCommands.ts';

/** The browser's own undo: the I/O edge this routing must not reach. jsdom has none, so each test adds one. */
function nativeUndo(result = true) {
  const native = vi.fn<(command: string) => boolean>(() => result);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: native });
  return native;
}

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'execCommand');
});

/** A focused field that records the key presses it sees and handles them, like the text model. */
function modelField(handles: boolean) {
  const field = document.createElement('textarea');
  document.body.append(field);
  field.focus();
  const presses: string[] = [];
  field.addEventListener('keydown', (event) => {
    presses.push(`${event.metaKey ? 'Meta+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}`);
    if (handles) event.preventDefault();
  });
  return presses;
}

describe('runMenuCommand', () => {
  it.each([
    ['undo', 'Meta+z'],
    ['redo', 'Meta+Shift+z'],
  ] as const)('gives %s to the focused field as its shortcut, and the browser does nothing', (command, press) => {
    const native = nativeUndo();
    const presses = modelField(true);
    runMenuCommand(command, document);
    expect(presses).toEqual([press]);
    expect(native).not.toHaveBeenCalled();
  });

  it("falls back to the browser's own undo for a field the app does not model", () => {
    const native = nativeUndo();
    const presses = modelField(false);
    runMenuCommand('undo', document);
    expect(presses).toEqual(['Meta+z']);
    expect(native).toHaveBeenCalledWith('undo');
  });
});
