import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Days and months: what comes after or before a day or a month, and putting a few in order.
 * Difficulty moves from days to months, from questions to ordering, and from runs inside the
 * week or year to runs that go round the end, such as Sunday to Monday.
 *
 * Days and months are indexes: Monday and January are 0, matching the shared clips. The round
 * never uses today, so it needs no clock.
 */

export type Cycle = 'days' | 'months';
type Mode = 'after' | 'before' | 'order';

export const CYCLE_LENGTH: Readonly<Record<Cycle, number>> = { days: 7, months: 12 };

interface Variant {
  readonly cycle: Cycle;
  readonly mode: Mode;
  /** Choices for a question, or tiles for ordering. */
  readonly count: number;
  /** Whether a run may go round the end of the week or year. */
  readonly wrap: boolean;
}

/** One list per difficulty, 1 first. A round picks one variant from its list. */
const TIERS: readonly (readonly Variant[])[] = [
  [{ cycle: 'days', mode: 'after', count: 3, wrap: false }],
  [
    { cycle: 'days', mode: 'after', count: 3, wrap: false },
    { cycle: 'days', mode: 'before', count: 3, wrap: false },
  ],
  [
    { cycle: 'days', mode: 'after', count: 3, wrap: true },
    { cycle: 'days', mode: 'before', count: 3, wrap: true },
    { cycle: 'days', mode: 'order', count: 3, wrap: false },
  ],
  [
    { cycle: 'days', mode: 'order', count: 4, wrap: true },
    { cycle: 'months', mode: 'after', count: 3, wrap: false },
  ],
  [
    { cycle: 'months', mode: 'after', count: 3, wrap: true },
    { cycle: 'months', mode: 'before', count: 3, wrap: true },
    { cycle: 'days', mode: 'order', count: 5, wrap: true },
  ],
  [
    { cycle: 'months', mode: 'order', count: 3, wrap: false },
    { cycle: 'months', mode: 'before', count: 4, wrap: true },
  ],
  [
    { cycle: 'months', mode: 'order', count: 4, wrap: true },
    { cycle: 'months', mode: 'after', count: 4, wrap: true },
  ],
  [
    { cycle: 'months', mode: 'order', count: 5, wrap: true },
    { cycle: 'months', mode: 'before', count: 4, wrap: true },
    { cycle: 'months', mode: 'after', count: 4, wrap: true },
  ],
];

export const MAX_DIFFICULTY = TIERS.length;

export interface QuestionRound {
  readonly mode: 'after' | 'before';
  readonly cycle: Cycle;
  /** The day or month the question names. */
  readonly given: number;
  readonly answer: number;
  /** In screen order, the answer among them once. */
  readonly choices: readonly number[];
}

export interface OrderRound {
  readonly mode: 'order';
  readonly cycle: Cycle;
  /** The run in its right order. */
  readonly run: readonly number[];
  /** The same run as the tiles show it, never already in order. */
  readonly tiles: readonly number[];
}

export type DaysAndMonthsLevel = QuestionRound | OrderRound;

function tierFor(difficulty: number): readonly Variant[] {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Days and months has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Going round the week or year: the item `by` places on from `from`. */
export function step(cycle: Cycle, from: number, by: number): number {
  const length = CYCLE_LENGTH[cycle];
  return (((from + by) % length) + length) % length;
}

/**
 * The wrong answers to try first: the one on the other side, which children mix up with the
 * answer, the one past the answer, and the named one itself. Then any other, nearest first.
 */
export function nearMisses(cycle: Cycle, given: number, answer: number): number[] {
  const away = answer === step(cycle, given, 1) ? 1 : -1;
  const near = [step(cycle, given, -away), step(cycle, given, 2 * away), given];
  const rest = Array.from({ length: CYCLE_LENGTH[cycle] }, (_, index) => index).toSorted(
    (a, b) => distance(cycle, a, given) - distance(cycle, b, given),
  );
  return [...new Set([...near, ...rest])].filter((item) => item !== answer);
}

function distance(cycle: Cycle, a: number, b: number): number {
  const apart = Math.abs(a - b);
  return Math.min(apart, CYCLE_LENGTH[cycle] - apart);
}

function question(random: Random, variant: Variant & { mode: 'after' | 'before' }): QuestionRound {
  const length = CYCLE_LENGTH[variant.cycle];
  const by = variant.mode === 'after' ? 1 : -1;
  // Without wrap, the answer stays inside the week or year: nothing after the last or before the first.
  const given = variant.wrap
    ? random.int(0, length - 1)
    : variant.mode === 'after'
      ? random.int(0, length - 2)
      : random.int(1, length - 1);
  const answer = step(variant.cycle, given, by);
  const wrong = nearMisses(variant.cycle, given, answer).slice(0, variant.count - 1);
  return { mode: variant.mode, cycle: variant.cycle, given, answer, choices: random.shuffle([answer, ...wrong]) };
}

function order(random: Random, variant: Variant): OrderRound {
  const length = CYCLE_LENGTH[variant.cycle];
  const start = random.int(0, variant.wrap ? length - 1 : length - variant.count);
  const run = Array.from({ length: variant.count }, (_, index) => step(variant.cycle, start, index));
  let tiles = random.shuffle(run);
  // A run that starts in order teaches nothing: turn it by one place, which always moves every tile.
  if (tiles.every((item, index) => item === run[index])) tiles = [...run.slice(1), ...run.slice(0, 1)];
  return { mode: 'order', cycle: variant.cycle, run, tiles };
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): DaysAndMonthsLevel {
  const random = createRandom(seed);
  const variant = random.pick(tierFor(difficulty));
  if (variant.mode === 'order') return order(random, variant);
  return question(random, { ...variant, mode: variant.mode });
}
