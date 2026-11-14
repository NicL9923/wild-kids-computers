import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { pickChoices } from '../../math/choices.ts';

/**
 * Number line: marks at equal steps, and either one label missing, with numbers to choose from,
 * or a number to place by clicking its mark. Difficulty moves the line away from zero, then
 * labels fewer marks, then counts by twos, fives, and tens, up to 100.
 */

type Mode = 'missing' | 'place';
/** Which marks show their number: all of them, the ends and the middle, or only the ends. */
export type Labels = 'all' | 'ends-middle' | 'ends';

interface Tier {
  readonly mode: Mode;
  readonly marks: 6 | 11;
  readonly step: 1 | 2 | 5 | 10;
  /** The largest first number; the first number is a multiple of the step from 0 to this. */
  readonly startMax: number;
  readonly labels: Labels;
  /** Numbers to choose from for `missing`; a `place` round has none. */
  readonly choices: 0 | 3 | 4;
}

/** One entry per difficulty, 1 first. Every line ends at 100 or below. */
export const TIERS: readonly Tier[] = [
  { mode: 'missing', marks: 6, step: 1, startMax: 0, labels: 'all', choices: 3 },
  { mode: 'missing', marks: 11, step: 1, startMax: 0, labels: 'all', choices: 3 },
  { mode: 'missing', marks: 11, step: 1, startMax: 10, labels: 'all', choices: 3 },
  { mode: 'place', marks: 11, step: 1, startMax: 0, labels: 'ends-middle', choices: 0 },
  { mode: 'place', marks: 11, step: 1, startMax: 20, labels: 'ends-middle', choices: 0 },
  { mode: 'missing', marks: 11, step: 2, startMax: 20, labels: 'all', choices: 4 },
  { mode: 'missing', marks: 11, step: 5, startMax: 25, labels: 'all', choices: 4 },
  { mode: 'place', marks: 11, step: 10, startMax: 0, labels: 'ends', choices: 0 },
  { mode: 'place', marks: 11, step: 5, startMax: 50, labels: 'ends', choices: 0 },
];

export const MAX_LINE_DIFFICULTY = TIERS.length;

export interface Mark {
  readonly index: number;
  readonly value: number;
  /** Whether the mark shows its number from the start. */
  readonly labeled: boolean;
}

export interface LineLevel {
  readonly mode: Mode;
  readonly step: number;
  readonly marks: readonly Mark[];
  /** The index of the mark to find: the missing one, or the place for the number. */
  readonly target: number;
  readonly answer: number;
  /** For `missing`: the numbers to choose from, smallest first. Empty for `place`. */
  readonly choices: readonly number[];
}

/** The tier for a difficulty. Throws outside 1 to MAX_LINE_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Number line has difficulty 1 to ${String(MAX_LINE_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Whether the mark at `index` of `count` shows its number under `labels`. */
export function isLabeled(labels: Labels, index: number, count: number): boolean {
  if (labels === 'all' || index === 0 || index === count - 1) return true;
  return labels === 'ends-middle' && index === (count - 1) / 2;
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): LineLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const start = random.int(0, tier.startMax / tier.step) * tier.step;
  // The mark to find is never an end, and never a mark that already shows its number.
  const open = Array.from({ length: tier.marks - 2 }, (_, index) => index + 1).filter(
    (index) => tier.mode === 'missing' || !isLabeled(tier.labels, index, tier.marks),
  );
  const target = random.pick(open);
  const marks = Array.from({ length: tier.marks }, (_, index) => ({
    index,
    value: start + index * tier.step,
    labeled: index !== target && isLabeled(tier.labels, index, tier.marks),
  }));
  const answer = start + target * tier.step;
  const choices =
    tier.choices === 0
      ? []
      : pickChoices(
          random,
          answer,
          tier.choices,
          wrongAnswers(answer, tier.step).filter((value) => value >= 0),
        );
  return { mode: tier.mode, step: tier.step, marks, target, answer, choices };
}

/** The numbers a child mistakes for the missing one: a step or two away, and one away when counting by more than one. */
function wrongAnswers(answer: number, step: number): number[] {
  const steps = [answer - 2 * step, answer - step, answer + step, answer + 2 * step];
  return step > 1 ? [...steps, answer - 1, answer + 1] : steps;
}
