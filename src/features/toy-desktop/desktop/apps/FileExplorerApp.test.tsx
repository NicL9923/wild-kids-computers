// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDesktop, picture } from '../../model/build.ts';
import { fakeLessonKit } from '../../lessons/harness/fakeLessonKit.ts';
import { LessonDesktop } from '../../lessons/harness/LessonDesktop.tsx';

/** A file explorer at Home, which holds one picture. */
const desktop = buildDesktop({ files: { Fox: picture('fox') }, windows: [{ app: 'file-explorer', folder: '' }] });

/** Layout is the I/O edge here: jsdom lays nothing out, so each element gets a fixed box. */
function placeAt(element: Element, left: number, top: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(left, top, 100, 100),
  });
}

/**
 * The explorer with every timer held, so nothing a timer would do has happened when the next
 * input arrives, as when a busy window runs input ahead of its timers.
 */
function showExplorer() {
  const fake = fakeLessonKit();
  const view = render(
    <LessonDesktop level={{ desktop }} band='band-9-12' kit={fake.kit} steps={[{ done: () => false }]} />,
  );
  const get = (selector: string) => {
    const found = view.container.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  const grip = get('[data-item="Fox"] .td-item-grip');
  const home = get('[data-place="home"]');
  const trash = get('[data-place="trash"]');
  placeAt(grip, 0, 400);
  placeAt(home, 0, 0);
  placeAt(trash, 0, 200);
  return { container: view.container, grip, trash };
}

type Explorer = ReturnType<typeof showExplorer>;

const AT_GRIP = { clientX: 50, clientY: 450 };
const AT_TRASH = { clientX: 50, clientY: 250 };
/** A click from a pointer counts its presses; a click from the keyboard has a detail of 0. */
const POINTER_CLICK = { detail: 1 };
const KEYBOARD_CLICK = { detail: 0 };

function pressAndRelease(element: HTMLElement, at: { clientX: number; clientY: number }): void {
  fireEvent.pointerDown(element, { ...at, button: 0, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(element, { ...at, button: 0, buttons: 0, pointerId: 1 });
}

/** Enter picks the picture up, the arrows choose Trash, and Enter puts it there. */
function dropWithKeyboard({ grip, trash }: Explorer): void {
  fireEvent.keyDown(grip, { key: 'Enter' });
  for (let presses = 0; presses < 4 && trash.dataset.carryOver !== 'true'; presses += 1) {
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
  }
  expect(trash.dataset.carryOver).toBe('true');
  fireEvent.keyDown(grip, { key: 'Enter' });
}

/** A click on the dots picks the picture up, and a click on Trash puts it there. */
function dropWithClicks({ grip, trash }: Explorer): void {
  pressAndRelease(grip, AT_GRIP);
  fireEvent.click(grip, POINTER_CLICK);
  pressAndRelease(trash, AT_TRASH);
  // The placing click lands on Trash, as it does in a browser after the release.
  fireEvent.click(trash, POINTER_CLICK);
}

/** A drag from the dots onto Trash. Its click lands on what holds both, not on Trash. */
function dropWithDrag({ grip, trash }: Explorer): void {
  fireEvent.pointerDown(grip, { ...AT_GRIP, button: 0, buttons: 1, pointerId: 1 });
  fireEvent.pointerMove(window, { ...AT_TRASH, buttons: 1, pointerId: 1 });
  fireEvent.pointerUp(trash, { ...AT_TRASH, button: 0, buttons: 0, pointerId: 1 });
}

const trashIsOpen = ({ trash }: Explorer) => trash.getAttribute('aria-current') === 'page';
const foxIsShown = ({ container }: Explorer) => container.querySelector('[data-item="Fox"]') !== null;

describe('the file explorer after a drop', () => {
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

  it('puts the picture in the trash and does not open it with the placing click', () => {
    const explorer = showExplorer();
    dropWithClicks(explorer);
    expect(foxIsShown(explorer)).toBe(false);
    expect(trashIsOpen(explorer)).toBe(false);
  });

  it.each([
    [
      'a keyboard drop, then Enter on Trash',
      dropWithKeyboard,
      ({ trash }: Explorer) => {
        fireEvent.keyDown(trash, { key: 'Enter' });
        fireEvent.click(trash, KEYBOARD_CLICK);
      },
    ],
    [
      'a click to place, then another click on Trash',
      dropWithClicks,
      ({ trash }: Explorer) => {
        pressAndRelease(trash, AT_TRASH);
        fireEvent.click(trash, POINTER_CLICK);
      },
    ],
    [
      'a drag, then a click on Trash',
      dropWithDrag,
      ({ trash }: Explorer) => {
        pressAndRelease(trash, AT_TRASH);
        fireEvent.click(trash, POINTER_CLICK);
      },
    ],
  ])('opens the trash at once after %s, before any timer runs', (_label, drop, openTrash) => {
    const explorer = showExplorer();
    drop(explorer);
    expect(foxIsShown(explorer)).toBe(false);
    openTrash(explorer);
    expect(trashIsOpen(explorer)).toBe(true);
    expect(foxIsShown(explorer)).toBe(true);
  });
});
