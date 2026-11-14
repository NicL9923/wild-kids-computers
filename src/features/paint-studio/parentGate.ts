import { useCallback } from 'react';
import { useSettings } from '../../app/session/sessionHooks.ts';

/**
 * The seam between the studio's export and print buttons and the parent gate.
 *
 * The buttons call `requestParentGate(reason)` and act only when it resolves true. The app shell
 * builds the real gate, `useParentGate()`, which asks the adult and resolves true when they pass.
 * Until that is connected here, the default resolves true only when the profile's settings say
 * export and print need no gate, so nothing a child taps can export or print by default.
 *
 * To connect the real gate, change only `useRequestParentGate` below so it returns the shell's
 * function when `outputNeedsParentGate` is true.
 */

export type ParentGateReason = 'export' | 'print';

export type RequestParentGate = (reason: ParentGateReason) => Promise<boolean>;

/** The default gate, apart from React: open only when no gate is needed. */
export function defaultParentGate(outputNeedsParentGate: () => boolean): RequestParentGate {
  return () => Promise.resolve(!outputNeedsParentGate());
}

/** The gate the export and print buttons use. */
export function useRequestParentGate(): RequestParentGate {
  const { settings } = useSettings();
  const needsGate = settings.outputNeedsParentGate;
  return useCallback<RequestParentGate>((reason) => defaultParentGate(() => needsGate)(reason), [needsGate]);
}
