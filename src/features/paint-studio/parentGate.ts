import { useCallback } from 'react';
import { useParentGate } from '../../app/parent-gate/ParentGate.tsx';
import { useSettings } from '../../app/session/sessionHooks.ts';

/**
 * The seam between the studio's export and print buttons and the app shell's parent gate.
 *
 * The buttons call `requestParentGate(reason)` and act only when it resolves true. When the
 * profile's settings say export and print need the gate, the default, it asks the adult through
 * the shell's `useParentGate()`. When a parent turned that off, it opens at once.
 */

export type ParentGateReason = 'export' | 'print';

export type RequestParentGate = (reason: ParentGateReason) => Promise<boolean>;

/** The rule apart from React: ask the adult only while the settings say output needs the gate. */
export function outputGate(outputNeedsParentGate: () => boolean, askParent: RequestParentGate): RequestParentGate {
  return (reason) => (outputNeedsParentGate() ? askParent(reason) : Promise.resolve(true));
}

/** The gate the export and print buttons use. */
export function useRequestParentGate(): RequestParentGate {
  const { settings } = useSettings();
  const askParent = useParentGate();
  const needsGate = settings.outputNeedsParentGate;
  return useCallback<RequestParentGate>(
    (reason) => outputGate(() => needsGate, askParent)(reason),
    [needsGate, askParent],
  );
}
