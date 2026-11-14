import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { nearby, pickChoices } from '../../math/choices.ts';

/**
 * Make ten: a ten frame with some counters in it, and numbers to choose from. The child finds
 * how many more fill the frame. The youngest start with a five frame. Difficulty fills the frame
 * in any order instead of left to right, adds a fourth choice, and then shows the number
 * sentence beside the frame.
 */

interface Tier {
  readonly whole: 5 | 10;
  /** The fewest and most counters already in the frame. */
  readonly min: number;
  readonly max: number;
  /** Counters fill the frame left to right, or in any spaces. */
  readonly order: 'in-order' | 'any';
  readonly choices: 3 | 4;
  /** Shows "7 + ? = 10" beside the frame. */
  readonly sentence: boolean;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { whole: 5, min: 2, max: 4, order: 'in-order', choices: 3, sentence: false },
  { whole: 5, min: 1, max: 4, order: 'in-order', choices: 3, sentence: false },
  { whole: 10, min: 5, max: 9, order: 'in-order', choices: 3, sentence: false },
  { whole: 10, min: 1, max: 9, order: 'in-order', choices: 3, sentence: false },
  { whole: 10, min: 1, max: 9, order: 'any', choices: 4, sentence: false },
  { whole: 10, min: 1, max: 9, order: 'in-order', choices: 4, sentence: true },
  { whole: 10, min: 1, max: 9, order: 'any', choices: 4, sentence: true },
];

export const MAX_TEN_DIFFICULTY = TIERS.length;

export interface TenLevel {
  readonly whole: 5 | 10;
  /** Counters already in the frame. */
  readonly filled: number;
  /** One entry per space, in reading order: true when a counter is in it. */
  readonly spaces: readonly boolean[];
  /** The number that makes the whole. */
  readonly answer: number;
  /** The numbers to choose from, smallest first. */
  readonly choices: readonly number[];
  readonly sentence: boolean;
}

/** The tier for a difficulty. Throws outside 1 to MAX_TEN_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Make ten has difficulty 1 to ${String(MAX_TEN_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TenLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const filled = random.int(tier.min, tier.max);
  const answer = tier.whole - filled;
  const indexes = Array.from({ length: tier.whole }, (_, index) => index);
  const taken = new Set(tier.order === 'any' ? random.sample(indexes, filled) : indexes.slice(0, filled));
  const spaces = indexes.map((index) => taken.has(index));
  // The mistake children make most is the number already there; then numbers near the answer.
  const choices = pickChoices(
    random,
    answer,
    tier.choices,
    [filled],
    nearby(answer, 2, 1, tier.whole),
    nearby(answer, 4, 1, tier.whole),
  );
  return { whole: tier.whole, filled, spaces, answer, choices, sentence: tier.sentence };
}
