import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { pickChoices } from '../../math/choices.ts';

/**
 * Times tables: rows of things to count, then the fact as numbers. The child picks the product.
 * There is no timer and no speed element. Difficulty starts with small arrays, then the tables
 * of two, five, and ten beside their fact, then the facts alone, up to ten times ten. When the
 * fact shows alone, two wrong tries bring the array back as help.
 */

/** What the child sees: the array, the array with its fact, or the fact alone. */
type Show = 'array' | 'both' | 'fact';

interface Tier {
  /** The rows of the array: the first number of the fact. */
  readonly rows: readonly number[];
  /** The things in each row: the second number of the fact. */
  readonly columns: readonly number[];
  readonly show: Show;
  readonly choices: 3 | 4;
}

const span = (low: number, high: number) => Array.from({ length: high - low + 1 }, (_, index) => low + index);

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { rows: span(2, 3), columns: span(2, 5), show: 'array', choices: 3 },
  { rows: span(2, 5), columns: span(2, 5), show: 'array', choices: 3 },
  { rows: span(2, 5), columns: [2, 5, 10], show: 'both', choices: 4 },
  { rows: span(2, 6), columns: span(2, 6), show: 'both', choices: 4 },
  { rows: span(1, 10), columns: [2, 5, 10], show: 'fact', choices: 4 },
  { rows: span(2, 6), columns: span(2, 6), show: 'fact', choices: 4 },
  { rows: span(2, 9), columns: span(2, 9), show: 'fact', choices: 4 },
  { rows: span(2, 10), columns: span(2, 10), show: 'fact', choices: 4 },
  { rows: span(6, 10), columns: span(6, 10), show: 'fact', choices: 4 },
];

export const MAX_TIMES_DIFFICULTY = TIERS.length;

const THINGS = [
  'apple',
  'strawberry',
  'cookie',
  'cupcake',
  'egg',
  'flower',
  'leaf',
  'shell',
  'soccer-ball',
  'crayon',
] as const satisfies readonly EmojiId[];

export interface TimesLevel {
  readonly rows: number;
  readonly columns: number;
  readonly answer: number;
  readonly kind: (typeof THINGS)[number];
  readonly show: Show;
  /** The numbers to choose from, smallest first. */
  readonly choices: readonly number[];
}

/** The tier for a difficulty. Throws outside 1 to MAX_TIMES_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Times tables has difficulty 1 to ${String(MAX_TIMES_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/**
 * The products children give by mistake: a neighboring fact, one row more or fewer, one more or
 * fewer in each row, and adding instead of multiplying. Each is at least 1 and has a clip.
 */
export function mistakesFor(rows: number, columns: number): number[] {
  return [
    (rows - 1) * columns,
    (rows + 1) * columns,
    rows * (columns - 1),
    rows * (columns + 1),
    rows + columns,
    (rows + 2) * columns,
  ].filter((value) => value >= 1 && value <= 100);
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TimesLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const rows = random.pick(tier.rows);
  const columns = random.pick(tier.columns);
  const answer = rows * columns;
  const kind = random.pick(THINGS);
  const near = [answer - 2, answer - 1, answer + 1, answer + 2].filter((value) => value >= 1 && value <= 100);
  const choices = pickChoices(random, answer, tier.choices, mistakesFor(rows, columns), near);
  return { rows, columns, answer, kind, show: tier.show, choices };
}
