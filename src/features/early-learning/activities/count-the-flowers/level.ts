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

/** Neat rows of up to PER_ROW, each row centered, the rows centered in the bed. */
function rowsLayout(count: number, size: number): Flower[] {
  const perRow = count <= PER_ROW ? count : Math.min(PER_ROW, Math.ceil(count / Math.ceil(count / PER_ROW)));
  const rows = Math.ceil(count / perRow);
  const stepX = Math.min(size * 1.5, BED.width / perRow);
  const stepY = Math.min(size * 1.25, BED.height / rows);
  const flowers: Flower[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const column = index % perRow;
    flowers.push({
      id: `flower-${String(index)}`,
      x: Math.round(BED.width / 2 + (column - (inRow - 1) / 2) * stepX),
      y: Math.round(BED.height / 2 + (row - (rows - 1) / 2) * stepY),
    });
  }
  return flowers;
}

/** The smallest distance between two scattered flower centers, so none overlap. */
export function scatterSpacing(size: number): number {
  return size * 1.1;
}

function scatterLayout(random: Random, count: number, size: number): Flower[] | null {
  const radius = size / 2;
  const spacing = scatterSpacing(size);
  const flowers: Flower[] = [];
  for (let index = 0; index < count; index += 1) {
    let placed: Flower | null = null;
    for (let attempt = 0; attempt < 80 && placed === null; attempt += 1) {
      const candidate = {
        id: `flower-${String(index)}`,
        x: random.int(Math.ceil(radius), Math.floor(BED.width - radius)),
        y: random.int(Math.ceil(radius), Math.floor(BED.height - radius)),
      };
      if (flowers.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= spacing))
        placed = candidate;
    }
    if (placed === null) return null;
    flowers.push(placed);
  }
  return flowers;
}

/** The answer and nearby numbers, smallest first. Distractors are within two of the answer and at least 1. */
function choicesFor(random: Random, count: number, total: number): number[] {
  const near = [count - 2, count - 1, count + 1, count + 2].filter((value) => value >= 1);
  const extra = near.length >= total - 1 ? near : [...near, count + 3];
  return [count, ...random.sample(extra, total - 1)].toSorted((a, b) => a - b);
}

/** Pure: the same seed, difficulty, and band give the same flowers and choices. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FlowersLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const count = random.int(tier.min, tier.max);
  const kind = random.pick(FLOWERS);
  const size = flowerSize(count);
  let flowers: Flower[] | null = null;
  let arrangement = tier.arrangement;
  if (arrangement === 'scatter') {
    for (let attempt = 0; attempt < 8 && flowers === null; attempt += 1) flowers = scatterLayout(random, count, size);
    // Rows always fit; a crowded patch falls back to them rather than overlapping.
    if (flowers === null) arrangement = 'rows';
  }
  flowers ??= rowsLayout(count, size);
  return { count, kind, arrangement, size, flowers, choices: choicesFor(random, count, tier.choices) };
}
