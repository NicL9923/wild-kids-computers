import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { nearby, pickChoices } from '../../math/choices.ts';

/**
 * Add and take away: things on screen to count, put together or taken away, and numbers to
 * choose from. Difficulty raises the numbers, brings in taking away, then shows the number
 * sentence beside the things, and at the top shows the sentence alone.
 */

export type Operation = 'add' | 'subtract';
/** What the child sees: things to count, things with the number sentence, or the sentence alone. */
type Show = 'things' | 'both' | 'sentence';

interface Tier {
  readonly operations: readonly Operation[];
  /** The smallest and largest whole: the sum when adding, the start when taking away. */
  readonly min: number;
  readonly max: number;
  readonly show: Show;
  readonly choices: 3 | 4;
  /** Whether taking away can leave nothing. */
  readonly zero: boolean;
}

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { operations: ['add'], min: 2, max: 3, show: 'things', choices: 3, zero: false },
  { operations: ['add'], min: 2, max: 5, show: 'things', choices: 3, zero: false },
  { operations: ['add', 'subtract'], min: 2, max: 5, show: 'things', choices: 3, zero: false },
  { operations: ['add', 'subtract'], min: 3, max: 6, show: 'things', choices: 3, zero: false },
  { operations: ['add', 'subtract'], min: 4, max: 8, show: 'things', choices: 3, zero: false },
  { operations: ['add', 'subtract'], min: 5, max: 10, show: 'both', choices: 3, zero: false },
  { operations: ['add', 'subtract'], min: 5, max: 10, show: 'both', choices: 4, zero: true },
  { operations: ['add', 'subtract'], min: 8, max: 15, show: 'both', choices: 4, zero: true },
  { operations: ['add', 'subtract'], min: 8, max: 15, show: 'sentence', choices: 4, zero: true },
  { operations: ['add', 'subtract'], min: 10, max: 20, show: 'sentence', choices: 4, zero: true },
];

export const MAX_ADD_DIFFICULTY = TIERS.length;

export const THINGS = [
  'apple',
  'orange',
  'frog',
  'rabbit',
  'chick',
  'ladybug',
  'balloon',
  'cookie',
  'duck',
  'strawberry',
] as const satisfies readonly EmojiId[];

export interface AddLevel {
  readonly operation: Operation;
  /** The first number: the first group when adding, the start when taking away. */
  readonly first: number;
  /** The second number: the group added, or the number taken away. */
  readonly second: number;
  readonly answer: number;
  readonly kind: (typeof THINGS)[number];
  readonly show: Show;
  /** The numbers to choose from, smallest first. */
  readonly choices: readonly number[];
}

/** The tier for a difficulty. Throws outside 1 to MAX_ADD_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Add and take away has difficulty 1 to ${String(MAX_ADD_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/** Every problem the tier allows, as [first, second]. Each group and each part taken is at least 1. */
export function problemsFor(tier: Tier, operation: Operation): [number, number][] {
  const found: [number, number][] = [];
  for (let whole = tier.min; whole <= tier.max; whole += 1) {
    for (let part = 1; part < whole; part += 1) found.push(operation === 'add' ? [part, whole - part] : [whole, part]);
    if (operation === 'subtract' && tier.zero) found.push([whole, whole]);
  }
  return found;
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): AddLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const operation = random.pick(tier.operations);
  const [first, second] = random.pick(problemsFor(tier, operation));
  const answer = operation === 'add' ? first + second : first - second;
  const kind = random.pick(THINGS);
  const lowest = tier.zero ? 0 : 1;
  // Three on each side leaves at least three wrong numbers, even when the answer is 0.
  const choices = pickChoices(random, answer, tier.choices, nearby(answer, 3, lowest, tier.max + 3));
  return { operation, first, second, answer, kind, show: tier.show, choices };
}
