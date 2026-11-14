import type { Band } from '../../core/bands.ts';

/**
 * The robot painter's timings, in a plain module so end-to-end tests can import them to step a
 * pinned kit clock.
 */

/** The calm pause between two steps of a short run, so the child sees which block made which move. */
const STEP_MS = 520;
/** The youngest children get a slower robot. */
const STEP_MS_YOUNGEST = 700;
/** The quickest a long run may step, still slow enough to follow the robot. */
const FASTEST_STEP_MS = 60;
/** A run that would take longer than this steps faster, so it finishes in about this long. */
const LONGEST_RUN_MS = 12_000;

/** The pause between steps for a run of `steps` primitive steps. */
export function stepPause(steps: number, band: Band): number {
  const calm = band === 'band-3-5' ? STEP_MS_YOUNGEST : STEP_MS;
  if (steps <= 0) return calm;
  return Math.max(FASTEST_STEP_MS, Math.min(calm, Math.floor(LONGEST_RUN_MS / steps)));
}

/** How long the robot stays where a run ended before it goes back to the start. */
export const RESULT_PAUSE_MS = 1600;

/** Runs that leave the puzzle unsolved before the picture shows where the drawing differs. */
export const VISUAL_HINT_AFTER = 2;
