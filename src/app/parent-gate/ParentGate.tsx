import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { ParentGateDialog } from './ParentGateDialog.tsx';
import type { ParentGateReason, RequestParentGate } from './reasons.ts';

const ParentGateContext = createContext<RequestParentGate | null>(null);

interface OpenGate {
  readonly reason: ParentGateReason;
  /** The element that had focus when the gate opened. Focus goes back to it on cancel. */
  readonly opener: Element | null;
  readonly settle: (passed: boolean) => void;
}

/**
 * Hosts the one parent gate of the app. RootLayout mounts it once. A request while the gate is
 * already open shares that gate's answer, so a close request during an export asks only once.
 */
export function ParentGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenGate | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);

  const request = useCallback<RequestParentGate>((reason) => {
    if (pending.current !== null) return pending.current;
    const answer = new Promise<boolean>((resolve) => {
      const settle = (passed: boolean) => {
        pending.current = null;
        setOpen(null);
        resolve(passed);
      };
      setOpen({ reason, opener: document.activeElement, settle });
    });
    pending.current = answer;
    return answer;
  }, []);

  return (
    <ParentGateContext value={request}>
      {children}
      {open !== null && <ParentGateDialog reason={open.reason} opener={open.opener} onSettle={open.settle} />}
    </ParentGateContext>
  );
}

/**
 * The parent gate. Call the function before export, print, quitting under kiosk lock, or
 * anything else a child must not do alone, and act only when it resolves true:
 *
 * ```ts
 * const askParent = useParentGate();
 * if (await askParent('export')) await exportPicture();
 * ```
 */
export function useParentGate(): RequestParentGate {
  const request = use(ParentGateContext);
  if (request === null) throw new Error('useParentGate needs the ParentGateProvider that RootLayout mounts.');
  return request;
}
