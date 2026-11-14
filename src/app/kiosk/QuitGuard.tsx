import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { systemScheduler } from '../../core/activityKit/scheduler.ts';
import { useParentGate } from '../parent-gate/ParentGate.tsx';
import { useSessionStore } from '../session/sessionHooks.ts';
import { useShellPlatform } from '../shell/shellPlatform.tsx';
import { createQuitFlow, type QuitFlow } from './closeRequest.ts';
import { quitWork } from './quitWork.ts';

const QuitFlowContext = createContext<QuitFlow | null>(null);

/**
 * Owns quitting for the whole app. The main process sends a close request on every close attempt.
 * With kiosk lock on the parent gate decides; with it off the guard finishes any unsaved picture
 * or session write and then quits. The browser build cannot hold a close request, so there the
 * guard holds the page's unload while work is unsaved. Mounted once by RootLayout.
 */
export function QuitGuard({ children }: { children: ReactNode }) {
  const platform = useShellPlatform();
  const askParent = useParentGate();
  const store = useSessionStore();
  const flow = useMemo(() => {
    // Real time, so a test that pins the kit clock cannot stop the deadline.
    const timers = systemScheduler();
    return createQuitFlow({
      window: platform.window,
      askParent,
      work: quitWork,
      session: store,
      setTimeout: (callback, ms) => timers.setTimeout(callback, ms),
    });
  }, [platform, askParent, store]);

  useEffect(() => platform.window.onCloseRequest((request) => void flow.closeRequested(request)), [platform, flow]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      // Electron keeps the window open when the page cancels its unload, with no dialog.
      if (flow.unloadRequested()) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flow]);

  return <QuitFlowContext.Provider value={flow}>{children}</QuitFlowContext.Provider>;
}

/** Closes the app the safe way: unsaved work first. For a control an adult reached past the parent gate. */
export function useQuitApp(): () => Promise<boolean> {
  const flow = useContext(QuitFlowContext);
  if (flow === null) throw new Error('useQuitApp needs QuitGuard above it.');
  return () => flow.quit();
}
