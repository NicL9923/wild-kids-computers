/**
 * The shell's own timings, in a plain module so end-to-end tests can import them to step a
 * pinned kit clock.
 */

/** The calm pause between a finished round and the next one. */
export const BETWEEN_ROUNDS_MS = 1200;

/** How long a feedback mark stays on screen. */
export const FEEDBACK_MARK_MS = 900;

/**
 * In free play, how long with no input before the shell checks the session length on its own.
 * Long enough that a child who stops to think keeps going; the activity's own checkpoints come
 * sooner.
 */
export const IDLE_CHECK_MS = 20_000;
