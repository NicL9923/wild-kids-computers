import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { pickChoices } from '../../math/choices.ts';

/**
 * Skip counting: a row of numbers counting by twos, fives, or tens, with one left blank. The
 * child picks the blank's number. Difficulty starts with tens from zero, the easiest pattern,
 * then fives and twos, then counts that start elsewhere, a blank in the middle, and finally
 * counts that do not start on a multiple of the step, such as 3, 13, 23.
 */

export type Step = 2 | 5 | 10;
/** Where the count starts: at zero, at a multiple of the step, or anywhere else. */
export type Start = 'zero' | 'multiple' | 'offset';

interface Tier {
  readonly steps: readonly Step[];
  readonly start: Start;
  /** How many numbers the row shows, the blank included. */
  readonly length: number;
  /** The blank is the last number, or any but the first. */
  readonly blank: 'end' | 'inside';
  readonly choices: 3 | 4;
  /** Shows "+2" over each hop between numbers. */
  readonly hops: boolean;
}

/** One entry per difficulty, 1 first. Every count stays at 100 or below. */
const TIERS: readonly Tier[] = [
  { steps: [10], start: 'zero', length: 5, blank: 'end', choices: 3, hops: true },
  { steps: [5], start: 'zero', length: 5, blank: 'end', choices: 3, hops: true },
  { steps: [2], start: 'zero', length: 5, blank: 'end', choices: 3, hops: true },
  { steps: [2, 5, 10], start: 'multiple', length: 6, blank: 'end', choices: 3, hops: true },
  { steps: [2, 5, 10], start: 'multiple', length: 6, blank: 'inside', choices: 4, hops: false },
  { steps: [10], start: 'offset', length: 6, blank: 'end', choices: 4, hops: false },
  { steps: [2, 5], start: 'offset', length: 6, blank: 'end', choices: 4, hops: false },
  { steps: [2, 5, 10], start: 'offset', length: 7, blank: 'inside', choices: 4, hops: false },
];

export const MAX_SKIP_DIFFICULTY = TIERS.length;

const LARGEST = 100;

export interface SkipLevel {
  readonly step: Step;
  /** Every number in the count, the blank one included. */
  readonly numbers: readonly number[];
  /** The index of the blank number. */
  readonly blank: number;
  readonly answer: number;
  /** The numbers to choose from, smallest first. */
  readonly choices: readonly number[];
  readonly hops: boolean;
}

/** The tier for a difficulty. Throws outside 1 to MAX_SKIP_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Skip counting has difficulty 1 to ${String(MAX_SKIP_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/** Every first number a count can have, so the whole count stays at LARGEST or below. */
export function startsFor(start: Start, step: Step, length: number): number[] {
  const highest = LARGEST - (length - 1) * step;
  if (start === 'zero') return [0];
  const found: number[] = [];
  for (let first = 1; first <= highest; first += 1) {
    if ((first % step === 0) === (start === 'multiple')) found.push(first);
  }
  return found;
}

/** The numbers from `values` that have a clip: 0 to LARGEST. */
const inRange = (values: readonly number[]) => values.filter((value) => value >= 0 && value <= LARGEST);

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SkipLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const step = random.pick(tier.steps);
  const first = random.pick(startsFor(tier.start, step, tier.length));
  const numbers = Array.from({ length: tier.length }, (_, index) => first + index * step);
  const blank = tier.blank === 'end' ? tier.length - 1 : random.int(1, tier.length - 1);
  const answer = first + blank * step;
  // The mistakes children make: counting on by one, and hopping a step or two too far or short.
  // At least three of them are always in range, even when the answer is 100.
  const choices = pickChoices(
    random,
    answer,
    tier.choices,
    inRange([answer - 1, answer + 1, answer - step, answer + step, answer - 2 * step, answer + 2 * step]),
  );
  return { step, numbers, blank, answer, choices, hops: tier.hops };
}
