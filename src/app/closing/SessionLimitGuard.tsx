import { useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { isOpenAfterSessionLimit } from '../paths.ts';
import { useSessionLimit } from './useSessionLimit.ts';

/**
 * Keeps a child on the closing screen once the session length is used up. It checks on every
 * change of screen, so the back button or a link cannot leave the closing screen, and a child
 * who reaches the limit on one screen sees the closing screen at the next one.
 */
export function SessionLimitGuard() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { closeIfLimitReached } = useSessionLimit();
  useEffect(() => {
    if (!isOpenAfterSessionLimit(pathname)) closeIfLimitReached();
  }, [pathname, closeIfLimitReached]);
  return null;
}
