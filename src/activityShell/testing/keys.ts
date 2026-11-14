import { act, fireEvent } from '@testing-library/react';

/** A key press: a `KeyboardEvent.key`, or the event's fields when the code or Shift matters. */
export type KeyPress = string | { readonly key: string; readonly code?: string; readonly shiftKey?: boolean };

/**
 * Sends every press to the focused element before React draws once, as when keys come faster
 * than the screen draws. A handler that reads the last render instead of live state judges the
 * second press against the first one's old state.
 */
export function pressBeforeRender(presses: readonly KeyPress[]): void {
  act(() => {
    for (const press of presses) {
      fireEvent.keyDown(document.activeElement ?? window, typeof press === 'string' ? { key: press } : press);
    }
  });
}
