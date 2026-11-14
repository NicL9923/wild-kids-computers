import type { ReactNode } from 'react';
import { SessionContext } from './sessionContext.ts';
import type { SessionStore } from './sessionStore.ts';

/** Shares the session store. main.tsx wraps the app once, above the router. */
export function SessionProvider({ store, children }: { store: SessionStore; children: ReactNode }) {
  return <SessionContext value={store}>{children}</SessionContext>;
}
