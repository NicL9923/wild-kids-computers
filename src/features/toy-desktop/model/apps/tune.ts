/**
 * A tune for the music box: a grid of steps played left to right, each with a set of notes
 * that sound together. The model holds no audio. A screen maps note rows to pitches.
 */

/** Steps in one loop of the tune. */
export const TUNE_STEPS = 8;

/** Note rows, lowest first. Five rows fit a pentatonic scale, where any mix sounds pleasant. */
export const TUNE_NOTES = 5;

export interface Tune {
  /** `steps[step][note]` is true when that note sounds on that step. */
  steps: boolean[][];
}

export function emptyTune(): Tune {
  return { steps: Array.from({ length: TUNE_STEPS }, () => Array.from({ length: TUNE_NOTES }, () => false)) };
}

/** Builds a tune from a list of `[step, note]` pairs that sound. Pairs outside the grid are ignored. */
export function tuneFrom(on: readonly (readonly [number, number])[]): Tune {
  const tune = emptyTune();
  for (const [step, note] of on) {
    const row = tune.steps[step];
    if (row !== undefined && note >= 0 && note < TUNE_NOTES) row[note] = true;
  }
  return tune;
}

/** Returns a new tune with one cell flipped, or the same tune when the cell is outside the grid. */
export function toggleNote(tune: Tune, step: number, note: number): Tune {
  const row = tune.steps[step];
  if (row === undefined || note < 0 || note >= TUNE_NOTES || !Number.isInteger(note)) return tune;
  return {
    steps: tune.steps.map((cells, index) => (index === step ? cells.map((on, n) => (n === note ? !on : on)) : cells)),
  };
}

/** The notes that sound on a step, lowest first. */
export function notesAt(tune: Tune, step: number): number[] {
  const row = tune.steps[step] ?? [];
  return row.flatMap((on, note) => (on ? [note] : []));
}

export function sameTune(a: Tune, b: Tune): boolean {
  return a.steps.every((row, step) => row.every((on, note) => b.steps[step]?.[note] === on));
}

export function isEmptyTune(tune: Tune): boolean {
  return tune.steps.every((row) => row.every((on) => !on));
}
