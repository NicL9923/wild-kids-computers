// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDesktop } from '../model/build.ts';
import { fakeLessonKit } from '../lessons/harness/fakeLessonKit.ts';
import { LessonDesktop } from '../lessons/harness/LessonDesktop.tsx';

/** A notepad with a sentence that was never saved. */
const desktop = buildDesktop({ windows: [{ app: 'notepad', text: 'I like frogs.' }] });

function show() {
  const view = render(
    <LessonDesktop level={{ desktop }} band='band-6-8' kit={fakeLessonKit().kit} steps={[{ done: () => false }]} />,
  );
  const get = (selector: string) => {
    const found = view.container.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  return { container: view.container, get };
}

describe('keyboard focus around save and open dialogs', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('puts the keyboard in the name field after File, then Save, so typing names the note', () => {
    const { get } = show();
    fireEvent.click(get('[data-menu="file"]'));
    fireEvent.click(get('[data-command="save"]'));
    expect(document.activeElement).toBe(get('[data-file-dialog="save-as"] input'));
  });

  it('gives the keyboard back to the note when the dialog closes', () => {
    const { container, get } = show();
    fireEvent.click(get('[data-menu="file"]'));
    fireEvent.click(get('[data-command="save"]'));
    const name = get('[data-file-dialog="save-as"] input');
    fireEvent.keyDown(name, { key: 'A' });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(container.querySelector('[data-file-dialog]')).toBeNull();
    expect(document.activeElement).toBe(get('[data-window] textarea'));
  });

  it('puts the keyboard in the open dialog after File, then Open', () => {
    const { get } = show();
    fireEvent.click(get('[data-menu="file"]'));
    fireEvent.click(get('[data-command="open"]'));
    expect(get('[data-file-dialog="open"]').contains(document.activeElement)).toBe(true);
  });
});
