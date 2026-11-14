import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { scatterSize, scatterSpots, type Spot } from '../../math/scatter.ts';

/**
 * More or fewer: two or three groups of one kind of thing, every thing the same size, so the
 * number is the only difference. The child picks the group with more, or with fewer. Difficulty
 * brings the numbers closer, adds "fewer", which young children learn later than "more", scatters
 * the things so they cannot be lined up by eye, and then adds a third group.
 */

export type Ask = 'more' | 'fewer' | 'most' | 'fewest';
export type Arrangement = 'rows' | 'scatter';

interface Tier {
  readonly min: number;
  readonly max: number;
  readonly groups: 2 | 3;
  /** The smallest and largest difference between neighboring counts. */
  readonly gap: readonly [number, number];
  readonly asks: readonly Ask[];
  readonly arrangement: Arrangement;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { min: 1, max: 5, groups: 2, gap: [3, 4], asks: ['more'], arrangement: 'rows' },
  { min: 1, max: 6, groups: 2, gap: [2, 4], asks: ['more'], arrangement: 'rows' },
  { min: 1, max: 8, groups: 2, gap: [2, 3], asks: ['more', 'fewer'], arrangement: 'rows' },
  { min: 2, max: 10, groups: 2, gap: [1, 3], asks: ['more', 'fewer'], arrangement: 'rows' },
  { min: 2, max: 10, groups: 2, gap: [1, 2], asks: ['more', 'fewer'], arrangement: 'scatter' },
  { min: 3, max: 12, groups: 3, gap: [1, 3], asks: ['most', 'fewest'], arrangement: 'scatter' },
  { min: 5, max: 15, groups: 3, gap: [1, 2], asks: ['most', 'fewest'], arrangement: 'scatter' },
  { min: 8, max: 20, groups: 3, gap: [1, 2], asks: ['most', 'fewest'], arrangement: 'scatter' },
];

export const MAX_MORE_DIFFICULTY = TIERS.length;

export const THINGS = [
  'apple',
  'cherries',
  'chick',
  'fish',
  'bee',
  'snail',
  'cookie',
  'tennis-ball',
  'leaf',
  'shell',
] as const satisfies readonly EmojiId[];

interface Group {
  readonly id: string;
  readonly count: number;
  /** Spots on the scatter board, or null for rows of five. */
  readonly spots: readonly Spot[] | null;
}

export interface MoreLevel {
  readonly ask: Ask;
  readonly kind: (typeof THINGS)[number];
  readonly arrangement: Arrangement;
  /** The width of every thing on a scatter board; the same in every group. */
  readonly size: number;
  /** The groups in the order they appear. Their counts all differ. */
  readonly groups: readonly Group[];
  /** The id of the group the question asks for. */
  readonly answer: string;
}

/** The tier for a difficulty. Throws outside 1 to MAX_MORE_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `More or fewer has difficulty 1 to ${String(MAX_MORE_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/** Every set of counts the tier allows, smallest first: neighbors differ by a gap in range. */
export function countSets(tier: Tier): number[][] {
  const [low, high] = tier.gap;
  let sets = Array.from({ length: tier.max - tier.min + 1 }, (_, index) => [tier.min + index]);
  for (let added = 1; added < tier.groups; added += 1) {
    sets = sets.flatMap((set) => {
      const last = set.at(-1) ?? 0;
      const grown: number[][] = [];
      for (let gap = low; gap <= high && last + gap <= tier.max; gap += 1) grown.push([...set, last + gap]);
      return grown;
    });
  }
  return sets;
}

/**
 * Spots for every group in a scatter, or rows for all of them. A scatter where one group does not
 * fit falls back to rows, so things never touch and every group looks alike.
 */
export function placeGroups(
  random: Random,
  counts: readonly number[],
  size: number,
  arrangement: Arrangement,
): { arrangement: Arrangement; spots: (readonly Spot[])[] | null } {
  if (arrangement === 'rows') return { arrangement, spots: null };
  const spots: Spot[][] = [];
  for (const count of counts) {
    const placed = scatterSpots(random, count, size);
    if (placed === null) return { arrangement: 'rows', spots: null };
    spots.push(placed);
  }
  return { arrangement, spots };
}

const wantsMore = (ask: Ask) => ask === 'more' || ask === 'most';

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MoreLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const ask = random.pick(tier.asks);
  const kind = random.pick(THINGS);
  const counts = random.pick(countSets(tier));
  const wanted = wantsMore(ask) ? Math.max(...counts) : Math.min(...counts);
  const order = random.shuffle(counts);
  const size = scatterSize(Math.max(...counts));
  const { arrangement, spots } = placeGroups(random, order, size, tier.arrangement);
  const groups = order.map((count, index) => ({ id: `group-${String(index)}`, count, spots: spots?.[index] ?? null }));
  return { ask, kind, arrangement, size, groups, answer: `group-${String(order.indexOf(wanted))}` };
}
