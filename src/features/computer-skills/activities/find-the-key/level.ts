import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { LETTERS, type Letter } from '../../shared/keyboardLayout.ts';

/**
 * Find the key: a few letters, one at a time, each shown and spoken. Difficulty adds letters,
 * opens the whole alphabet, and takes away the help on the keyboard picture: first the key is
 * lit, then only its row, then nothing.
 */

/** How the keyboard picture helps: light the key, tint its row, or show nothing. */
type KeyHelp = 'key' | 'row' | 'none';

export interface Step {
  readonly count: number;
  readonly pool: 'first' | 'all';
  readonly help: KeyHelp;
}

/**
 * Letters for the first rounds: shapes that do not mirror each other on the key caps, and
 * letters young children see often.
 */
export const FIRST_LETTERS: readonly Letter[] = ['a', 'b', 'c', 'e', 'm', 'o', 's', 't'];

export const ALL_LETTERS: readonly Letter[] = LETTERS;

/** One entry per difficulty, 1 first. Each step changes one thing. */
export const STEPS: readonly Step[] = [
  { count: 1, pool: 'first', help: 'key' },
  { count: 2, pool: 'first', help: 'key' },
  { count: 2, pool: 'all', help: 'key' },
  { count: 3, pool: 'all', help: 'key' },
  { count: 3, pool: 'all', help: 'row' },
  { count: 4, pool: 'all', help: 'row' },
  { count: 4, pool: 'all', help: 'none' },
  { count: 5, pool: 'all', help: 'none' },
];

export const MAX_KEY_DIFFICULTY = STEPS.length;

/** The pause after the right key, so the child sees it light before the next letter. */
export const NEXT_LETTER_MS = 900;

export interface KeyLevel {
  /** The letters to press, in order. No letter repeats within a round. */
  readonly letters: readonly Letter[];
  readonly help: KeyHelp;
}

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(`Find the key has difficulty 1 to ${String(MAX_KEY_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return step;
}

/** Pure: the same seed and difficulty give the same letters. The band does not change them. */
export function generateLevel(seed: number, difficulty: number, _band: Band): KeyLevel {
  const step = stepFor(difficulty);
  const pool = step.pool === 'first' ? FIRST_LETTERS : ALL_LETTERS;
  return { letters: createRandom(seed).sample(pool, step.count), help: step.help };
}
