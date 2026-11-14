import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { ALL_PICTURES, PICTURE_SET_IDS, PICTURE_SETS, type Picture } from '../../logic/pictures.ts';

/**
 * Memory pairs: picture cards face down, each picture on exactly two cards. Difficulty adds pairs
 * a little at a time, and from the middle of the range draws every picture from one set, such
 * as all animals, so pictures look more alike and take a closer look to remember.
 */

interface Tier {
  readonly pairs: number;
  /** True when every picture comes from one set. */
  readonly oneSet: boolean;
}

/** One entry per difficulty, 1 first. Each step adds at most two pairs or narrows the pictures. */
const TIERS: readonly Tier[] = [
  { pairs: 2, oneSet: false },
  { pairs: 3, oneSet: false },
  { pairs: 4, oneSet: false },
  { pairs: 5, oneSet: false },
  { pairs: 6, oneSet: false },
  { pairs: 6, oneSet: true },
  { pairs: 8, oneSet: true },
  { pairs: 9, oneSet: true },
  { pairs: 10, oneSet: true },
  { pairs: 12, oneSet: true },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface MemoryCard {
  readonly id: string;
  readonly picture: Picture;
}

export interface MemoryPairsLevel {
  /** In board order, row by row. */
  readonly cards: readonly MemoryCard[];
  /** Cards per row. */
  readonly columns: number;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Memory pairs has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The board is about twice as wide as it is tall. */
const BOARD_ASPECT = 2;

/**
 * Cards per row that make the cards biggest on a board twice as wide as tall. Among equal sizes
 * the fewest columns win, so four cards make a square.
 */
export function columnsFor(count: number): number {
  let best = 1;
  let bestSize = 0;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const size = Math.min(BOARD_ASPECT / columns, 1 / rows);
    if (size > bestSize) {
      best = columns;
      bestSize = size;
    }
  }
  return best;
}

/** Pure: the same seed and difficulty give the same board. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MemoryPairsLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const pool: readonly Picture[] = tier.oneSet ? PICTURE_SETS[random.pick(PICTURE_SET_IDS)] : ALL_PICTURES;
  const pictures = random.sample(pool, tier.pairs);
  const cards = random
    .shuffle([...pictures, ...pictures])
    .map((picture, index): MemoryCard => ({ id: `card-${String(index)}`, picture }));
  return { cards, columns: columnsFor(cards.length) };
}
