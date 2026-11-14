/** The session's clocks. Tests pass a pinned one. */
export interface SessionClock {
  /** Wall time in milliseconds since the epoch. Practice days and round times use it. */
  now(): number;
  /** Milliseconds from an arbitrary start that never jumps back. Play time uses it. */
  monotonic(): number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Whether the parent's session length is used up. Null means no limit, the default. The limit is
 * reached at exactly the set length, so a 20 minute limit ends a session at 20:00, not 20:01.
 */
export function isSessionLimitReached(playedMs: number, limitMinutes: number | null): boolean {
  return limitMinutes !== null && playedMs >= limitMinutes * MS_PER_MINUTE;
}
