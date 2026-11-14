import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Big and small: the same picture in a few sizes. First the child picks the bigger or the
 * smaller one, then the biggest or smallest of three, then clicks them in order of size.
 * Difficulty adds pictures and brings the sizes closer together, in small steps.
 *
 * Sizes are in board units: the row is 1200 units wide and a picture is a square.
 */

export const ROW_WIDTH = 1200;
/** The space between two pictures in a row. */
export const GAP = 40;

/** Pictures with one clear outline, shown alike in every size. */
export const KINDS = [
  'teddy-bear',
  'apple',
  'duck',
  'balloon',
  'dog',
  'fish',
  'car',
  'tree',
] as const satisfies readonly EmojiId[];

type Mode = 'pick' | 'order';
/** Which end the child looks for: the biggest first, or the smallest first. */
type Direction = 'big' | 'small';

interface Tier {
  readonly mode: Mode;
  readonly count: number;
  /** Each picture is this many times the size of the next smaller one. */
  readonly ratio: number;
  readonly directions: readonly Direction[];
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { mode: 'pick', count: 2, ratio: 2, directions: ['big'] },
  { mode: 'pick', count: 2, ratio: 1.7, directions: ['big', 'small'] },
  { mode: 'pick', count: 3, ratio: 1.45, directions: ['big', 'small'] },
  { mode: 'pick', count: 3, ratio: 1.3, directions: ['big', 'small'] },
  { mode: 'order', count: 3, ratio: 1.4, directions: ['small'] },
  { mode: 'order', count: 4, ratio: 1.3, directions: ['small', 'big'] },
  { mode: 'order', count: 4, ratio: 1.22, directions: ['small', 'big'] },
  { mode: 'order', count: 5, ratio: 1.18, directions: ['small', 'big'] },
];

export const MAX_DIFFICULTY = TIERS.length;

export type ItemId = `item-${number}`;

export interface Item {
  readonly id: ItemId;
  /** The side of the picture's square, in board units. */
  readonly size: number;
}

export interface BigAndSmallLevel {
  readonly mode: Mode;
  readonly direction: Direction;
  readonly kind: (typeof KINDS)[number];
  /** The pictures in screen order. */
  readonly items: readonly Item[];
  /** The pictures to click, in order: one for `pick`, all of them for `order`. */
  readonly answer: readonly [ItemId, ...ItemId[]];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Big and small has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The biggest picture, smaller when more share the row. */
function biggestSize(count: number): number {
  if (count <= 3) return 300;
  if (count === 4) return 260;
  return 230;
}

/** The sizes, biggest first, each `ratio` times the next. */
export function sizesFor(count: number, ratio: number): number[] {
  const biggest = biggestSize(count);
  return Array.from({ length: count }, (_, index) => Math.round(biggest / ratio ** index));
}

/** True when clicking the pictures left to right would follow the size order the round asks for. */
const inClickOrder = (sizes: readonly number[], direction: Direction) =>
  sizes.every((size, index) => {
    const before = sizes[index - 1];
    return before === undefined || (direction === 'small' ? size > before : size < before);
  });

/**
 * An order where clicking left to right is not the answer, so an order round never asks for a
 * plain walk along the row. Only that one order is ruled out: ruling out the reverse too would
 * leave three pictures with the middle size never in the middle, a rule a child could learn.
 */
export function unsortedOrder(random: Random, sizes: readonly number[], direction: Direction): number[] {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const order = random.shuffle(sizes);
    if (!inClickOrder(order, direction)) return order;
  }
  // Turning the click order by one place moves every picture, so it is never the click order.
  const clickOrder = sizes.toSorted((a, b) => (direction === 'small' ? a - b : b - a));
  return [...clickOrder.slice(1), ...clickOrder.slice(0, 1)];
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): BigAndSmallLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const direction = random.pick(tier.directions);
  const kind = random.pick(KINDS);
  const sizes = sizesFor(tier.count, tier.ratio);
  const order = tier.mode === 'order' ? unsortedOrder(random, sizes, direction) : random.shuffle(sizes);
  const items = order.map((size, index): Item => ({ id: `item-${index}`, size }));
  const bySize = items.toSorted((a, b) => (direction === 'big' ? b.size - a.size : a.size - b.size));
  const [first, ...rest] = bySize.map((item) => item.id);
  if (first === undefined) throw new Error('Big and small always has pictures.');
  return { mode: tier.mode, direction, kind, items, answer: tier.mode === 'pick' ? [first] : [first, ...rest] };
}
