/**
 * Seeded randomness for level generators. A generator receives a seed and builds everything
 * random about a level from `createRandom(seed)`, so the same seed, difficulty, and band always
 * give the same level, in the app and in a test.
 */

const UINT32_LIMIT = 0x1_0000_0000;

/** A generator built from one seed. Every helper draws from the same sequence. */
export interface Random {
  /** A float in [0, 1). */
  next(): number;
  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** One item. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
  /** A new array with the items in random order. The input is not changed. */
  shuffle<T>(items: readonly T[]): T[];
  /** `count` different items in random order, without replacement. */
  sample<T>(items: readonly T[], count: number): T[];
}

function assertSeed(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_LIMIT) {
    throw new RangeError(`${name} must be a whole number from 0 to 4294967295, not ${String(value)}.`);
  }
}

/** A generator for one seed, a whole number from 0 to 2^32 - 1. The algorithm is mulberry32. */
export function createRandom(seed: number): Random {
  assertSeed('A seed', seed);
  let state = seed;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_LIMIT;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`int needs whole numbers, not ${String(min)} and ${String(max)}.`);
    }
    if (min > max) throw new RangeError(`int needs min <= max, not ${String(min)} > ${String(max)}.`);
    return min + Math.floor(next() * (max - min + 1));
  };

  // Draws each next item from the ones left, which is a Fisher-Yates shuffle without index juggling.
  const shuffle = <T>(items: readonly T[]): T[] => {
    const left = [...items];
    const result: T[] = [];
    while (left.length > 0) result.push(...left.splice(int(0, left.length - 1), 1));
    return result;
  };

  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => {
      if (items.length > 0) for (const item of items.slice(int(0, items.length - 1))) return item;
      throw new RangeError('pick needs at least one item.');
    },
    shuffle,
    sample: <T>(items: readonly T[], count: number): T[] => {
      if (!Number.isInteger(count) || count < 0 || count > items.length) {
        throw new RangeError(`sample needs a count from 0 to ${String(items.length)}, not ${String(count)}.`);
      }
      return shuffle(items).slice(0, count);
    },
  };
}

/**
 * The seed of one round: a mix of the session seed and the round index. The activity shell and
 * end-to-end tests both call this, so a test computes the same level the child sees.
 */
export function roundSeed(sessionSeed: number, roundIndex: number): number {
  assertSeed('A session seed', sessionSeed);
  if (!Number.isInteger(roundIndex) || roundIndex < 0) {
    throw new RangeError(`A round index is a whole number from 0, not ${String(roundIndex)}.`);
  }
  // murmur3's finalizer over the seed and the index, so neighboring rounds get unrelated seeds.
  let h = (sessionSeed ^ Math.imul(roundIndex + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
