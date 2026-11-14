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

/**
 * How long an activity's component may take to load before the shell offers to try again. The
 * component is a chunk of the app's own bundle, read from the local disk in milliseconds, so this
 * passes only when something is wrong. Counted in real time, not on the kit clock a test pins.
 */
export const ACTIVITY_LOAD_DEADLINE_MS = 10_000;
