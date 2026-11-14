import { useEffect } from 'react';
import { useParentGate } from '../parent-gate/ParentGate.tsx';
import { useSessionStore } from '../session/sessionHooks.ts';
import { useShellPlatform } from '../shell/shellPlatform.tsx';
import { answerCloseRequest } from './closeRequest.ts';

/**
 * Listens for close requests for the whole app. The main process sends one only while kiosk lock
 * is on; then the parent gate decides whether the app quits. Mounted once by RootLayout.
 */
export function KioskCloseGuard() {
  const platform = useShellPlatform();
  const askParent = useParentGate();
  const store = useSessionStore();
  useEffect(
    () =>
      platform.window.onCloseRequest(() => {
        void answerCloseRequest(platform.window, askParent, store.flush);
      }),
    [platform, askParent, store],
  );
  return null;
}
