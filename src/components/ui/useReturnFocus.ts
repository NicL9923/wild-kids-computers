import { useMemo, useRef } from 'react';

/**
 * Sends focus back to whatever opened a dialog when it closes. Radix does this only for its own
 * Trigger component; these dialogs are opened by any button, so they remember the focused
 * element as they open. Spread the result onto the Radix Content.
 */
export function useReturnFocus() {
  const opener = useRef<Element | null>(null);
  return useMemo(
    () => ({
      onOpenAutoFocus: () => {
        opener.current = document.activeElement;
      },
      onCloseAutoFocus: (event: Event) => {
        if (opener.current instanceof HTMLElement && opener.current.isConnected) {
          event.preventDefault();
          opener.current.focus();
        }
        opener.current = null;
      },
    }),
    [],
  );
}
