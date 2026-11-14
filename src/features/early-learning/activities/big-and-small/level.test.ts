import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import {
  GAP,
  generateLevel,
  KINDS,
  MAX_DIFFICULTY,
  ROW_WIDTH,
  sizesFor,
  unsortedOrder,
  type BigAndSmallLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 4_817 + 9);

/** The smallest picture is still at least this many board units, a big target in any band. */
const SMALLEST = 110;

/** What makes a round fair: one row that fits, sizes clearly apart, and the answer is right. */
function problems(level: BigAndSmallLevel): string[] {
  const found: string[] = [];
  const sizes = level.items.map((item) => item.size);
  const sorted = sizes.toSorted((a, b) => b - a);
  if (sizes.reduce((sum, size) => sum + size, 0) + GAP * (sizes.length - 1) > ROW_WIDTH)
    found.push('the row is too wide');
  if (Math.min(...sizes) < SMALLEST) found.push('a picture is too small');
  if (new Set(sizes).size !== sizes.length) found.push('two pictures are the same size');
  sorted.forEach((size, index) => {
    const next = sorted[index + 1];
    if (next !== undefined && size / next < 1.15) found.push(`${String(size)} and ${String(next)} are too close`);
  });
  const sizeOf = (id: string) => level.items.find((item) => item.id === id)?.size ?? Number.NaN;
  const wanted = level.direction === 'big' ? sorted : sorted.toReversed();
  const expected = level.mode === 'pick' ? wanted.slice(0, 1) : wanted;
  if (level.answer.map(sizeOf).join() !== expected.join()) found.push('the answer is not in size order');
  return found;
}

const isSortedEitherWay = (sizes: readonly number[]) =>
  [sizes, sizes.toReversed()].some((list) =>
    list.every((size, index) => index === 0 || size >= (list[index - 1] ?? 0)),
  );

describe('generateLevel', () => {
  // The design table: what the child does, how many pictures, and how far apart in size.
  it.each([
    [1, 'pick', 2, 2, ['big']],
    [2, 'pick', 2, 1.7, ['big', 'small']],
    [3, 'pick', 3, 1.45, ['big', 'small']],
    [4, 'pick', 3, 1.3, ['big', 'small']],
    [5, 'order', 3, 1.4, ['small']],
    [6, 'order', 4, 1.3, ['big', 'small']],
    [7, 'order', 4, 1.22, ['big', 'small']],
    [8, 'order', 5, 1.18, ['big', 'small']],
  ] as const)(
    'at difficulty %i asks to %s among %i pictures, %f apart',
    (difficulty, mode, count, ratio, directions) => {
      const seen = new Set<string>();
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.mode).toBe(mode);
        expect(level.items).toHaveLength(count);
        const sizes = level.items.map((item) => item.size).toSorted((a, b) => b - a);
        for (let index = 1; index < sizes.length; index += 1) {
          expect((sizes[index - 1] ?? 0) / (sizes[index] ?? 1)).toBeCloseTo(ratio, 1);
        }
        // An order round never starts solved.
        expect(mode === 'order' && isSortedEitherWay(level.items.map((item) => item.size))).toBe(false);
        seen.add(level.direction);
      }
      expect([...seen].toSorted()).toEqual([...directions].toSorted());
    },
  );

  it('puts the answer of a pick round in every place across rounds', () => {
    const places = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 3, 'band-3-5');
        return level.items.findIndex((item) => item.id === level.answer[0]);
      }),
    );
    expect([...places].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('uses every picture across rounds', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5').kind));
    expect([...kinds].toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...KINDS].toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 6, 'band-6-8')).toEqual(generateLevel(3, 6, 'band-6-8'));
    expect(generateLevel(3, 6, 'band-6-8')).not.toEqual(generateLevel(4, 6, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(
      `Big and small has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});

describe('sizesFor', () => {
  // A crowded row shrinks its biggest picture so the row still fits.
  it.each([
    [2, 2, [300, 150]],
    [3, 1.45, [300, 207, 143]],
    [4, 1.3, [260, 200, 154, 118]],
    [5, 1.18, [230, 195, 165, 140, 119]],
  ])('gives %i pictures %f apart the sizes %j', (count, ratio, sizes) => {
    expect(sizesFor(count, ratio)).toEqual(sizes);
  });
});

describe('unsortedOrder', () => {
  const still: Random = {
    next: () => 0,
    int: (min) => min,
    pick: (items) => {
      for (const item of items) return item;
      throw new RangeError('empty');
    },
    shuffle: (items) => [...items],
    sample: (items, count) => items.slice(0, count),
  };

  it.each([
    [
      [300, 214, 153],
      [300, 153, 214],
    ],
    [
      [260, 200, 154, 118],
      [260, 118, 200, 154],
    ],
  ])('mixes sorted sizes %j when shuffling keeps them sorted', (sizes, expected) => {
    const order = unsortedOrder(still, sizes);
    expect(order).toEqual(expected);
    expect(isSortedEitherWay(order)).toBe(false);
  });
});
