import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Count the flowers: some flowers of one kind, and a few numbers to choose from. Difficulty
 * raises the quantity and loosens the arrangement, from one neat row to a scattered patch.
 *
 * The flower bed is 1000 by 440 units and scales to fit. Positions are flower centers.
 */

export const BED = { width: 1000, height: 440 } as const;

export type Arrangement = 'row' | 'rows' | 'scatter';

interface Tier {
  readonly min: number;
  readonly max: number;
  readonly arrangement: Arrangement;
  readonly choices: number;
}

/** One entry per difficulty, 1 first. Neighbors differ by a little, so no step is a jump. */
export const TIERS: readonly Tier[] = [
  { min: 1, max: 3, arrangement: 'row', choices: 3 },
  { min: 2, max: 4, arrangement: 'row', choices: 3 },
  { min: 2, max: 5, arrangement: 'rows', choices: 3 },
  { min: 3, max: 6, arrangement: 'rows', choices: 3 },
  { min: 4, max: 8, arrangement: 'scatter', choices: 3 },
  { min: 5, max: 10, arrangement: 'rows', choices: 4 },
  { min: 6, max: 12, arrangement: 'scatter', choices: 4 },
  { min: 8, max: 14, arrangement: 'scatter', choices: 4 },
  { min: 10, max: 17, arrangement: 'scatter', choices: 4 },
  { min: 12, max: 20, arrangement: 'scatter', choices: 4 },
];

export const MAX_FLOWER_DIFFICULTY = TIERS.length;

/** The flowers a round can show. One kind per round, so every flower counts the same. */
export const FLOWERS = ['flower', 'tulip', 'sunflower', 'rose', 'cherry-blossom'] as const satisfies readonly EmojiId[];

/** Flowers in a row before the next row starts, like a ten frame. */
export const PER_ROW = 5;

export interface Flower {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface FlowersLevel {
  /** The answer. */
  readonly count: number;
  readonly kind: (typeof FLOWERS)[number];
  readonly arrangement: Arrangement;
  /** Diameter of every flower, in bed units. */
  readonly size: number;
  readonly flowers: readonly Flower[];
  /** The numbers to pick from, smallest first. One of them is `count`. */
  readonly choices: readonly number[];
}

/** Bigger flowers when there are fewer to count. */
export function flowerSize(count: number): number {
  if (count <= 4) return 170;
  if (count <= 8) return 130;
  if (count <= 12) return 105;
  return 82;
}

/** The tier for a difficulty. Throws outside 1 to MAX_FLOWER_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Count the flowers has difficulty 1 to ${String(MAX_FLOWER_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/**
 * Neat rows of up to PER_ROW, as even as they can be, each row centered and the rows centered in
 * the bed. Flowers come in reading order, so Tab moves left to right and top to bottom.
 */
export function rowsLayout(count: number, size: number): Flower[] {
  const rows = Math.ceil(count / PER_ROW);
  // The first `longer` rows take one more flower, so rows differ by at most one.
  const shortRow = Math.floor(count / rows);
  const longer = count % rows;
  const lengths = Array.from({ length: rows }, (_, row) => shortRow + (row < longer ? 1 : 0));
  // flowerSize keeps five across and four down inside the bed; the level test checks it.
  const stepX = size * 1.5;
  const stepY = size * 1.25;
  const flowers: Flower[] = [];
  lengths.forEach((inRow, row) => {
    for (let column = 0; column < inRow; column += 1) {
      flowers.push({
        id: `flower-${String(flowers.length)}`,
        x: Math.round(BED.width / 2 + (column - (inRow - 1) / 2) * stepX),
        y: Math.round(BED.height / 2 + (row - (rows - 1) / 2) * stepY),
      });
    }
  });
  return flowers;
}

/** Scattered flowers keep a tenth of their size between them, so none touch. */
const SCATTER_SPACING = 1.1;

/** Flowers at random places that do not touch, or null when there is no room for them all. */
export function scatterLayout(random: Random, count: number, size: number): Flower[] | null {
  const flowers: Flower[] = [];
  for (let index = 0; index < count; index += 1) {
    const spot = findSpot(random, flowers, size);
    if (spot === null) return null;
    flowers.push({ id: `flower-${String(index)}`, ...spot });
  }
  return flowers;
}

const SPOT_ATTEMPTS = 80;

/** The first random spot in the bed that keeps the spacing from every flower placed so far. */
function findSpot(random: Random, placed: readonly Flower[], size: number): { x: number; y: number } | null {
  const radius = size / 2;
  for (let attempt = 0; attempt < SPOT_ATTEMPTS; attempt += 1) {
    const x = random.int(Math.ceil(radius), Math.floor(BED.width - radius));
    const y = random.int(Math.ceil(radius), Math.floor(BED.height - radius));
    if (placed.every((other) => Math.hypot(x - other.x, y - other.y) >= size * SCATTER_SPACING)) return { x, y };
  }
  return null;
}

/**
 * The answer and nearby numbers, smallest first. Distractors are within two of the answer and at
 * least 1. Every tier leaves enough of them: an answer of 1 still has 2 and 3.
 */
function choicesFor(random: Random, count: number, total: number): number[] {
  const near = [count - 2, count - 1, count + 1, count + 2].filter((value) => value >= 1);
  return [count, ...random.sample(near, total - 1)].toSorted((a, b) => a - b);
}

const SCATTER_TRIES = 8;

/** Flowers in the tier's arrangement. A crowded scatter falls back to rows rather than overlap. */
export function placeFlowers(
  random: Random,
  count: number,
  size: number,
  arrangement: Arrangement,
): { flowers: Flower[]; arrangement: Arrangement } {
  if (arrangement === 'scatter') {
    for (let attempt = 0; attempt < SCATTER_TRIES; attempt += 1) {
      const flowers = scatterLayout(random, count, size);
      if (flowers !== null) return { flowers, arrangement };
    }
    return { flowers: rowsLayout(count, size), arrangement: 'rows' };
  }
  return { flowers: rowsLayout(count, size), arrangement };
}

/** Pure: the same seed, difficulty, and band give the same flowers and choices. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FlowersLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const count = random.int(tier.min, tier.max);
  const kind = random.pick(FLOWERS);
  const size = flowerSize(count);
  const { flowers, arrangement } = placeFlowers(random, count, size, tier.arrangement);
  return { count, kind, arrangement, size, flowers, choices: choicesFor(random, count, tier.choices) };
}
