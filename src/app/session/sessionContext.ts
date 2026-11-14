import { createContext } from 'react';
import type { SessionStore } from './sessionStore.ts';

export const SessionContext = createContext<SessionStore | null>(null);
