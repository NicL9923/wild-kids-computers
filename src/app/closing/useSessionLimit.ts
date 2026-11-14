import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { CLOSING_PATH } from '../paths.ts';
import { useSessionLength } from '../session/sessionHooks.ts';

/** How much time "a little more time" on the closing screen gives. */
export const MORE_TIME_MS = 10 * 60_000;

/**
 * The session length for features. Nothing here interrupts the child or re-renders on time:
 * a feature asks at a natural stopping point and the shell shows the calm closing screen.
 *
 * - The activity kit checks between rounds, never during one, and free play at its calm moments.
 * - The paint studio checks when the pen is up, so a stroke is never cut off.
 * - The shell checks when the child moves to another screen.
 *
 * ```ts
 * const { closeIfLimitReached } = useSessionLimit();
 * if (closeIfLimitReached()) return; // the closing screen is on its way
 * ```
 */
export function useSessionLimit(): {
  /** Whether the parent's session length is used up for the active child. */
  isLimitReached: () => boolean;
  /** Goes to the closing screen when the limit is reached, and says whether it did. */
  closeIfLimitReached: () => boolean;
} {
  const { isLimitReached } = useSessionLength();
  const navigate = useNavigate();
  const closeIfLimitReached = useCallback(() => {
    if (!isLimitReached()) return false;
    void navigate({ to: CLOSING_PATH, replace: true });
    return true;
  }, [isLimitReached, navigate]);
  return useMemo(() => ({ isLimitReached, closeIfLimitReached }), [isLimitReached, closeIfLimitReached]);
}
