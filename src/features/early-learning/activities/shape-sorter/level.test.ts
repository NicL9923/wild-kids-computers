import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import { SHAPE_KINDS, type ShapeKind } from '../../shapes/shapes.ts';
import { FORMS, generateLevel, holeOrder, lookAlike, MAX_DIFFICULTY, type ShapeSorterLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 6_151 + 5);

/** What makes a round fair: one hole per shape, every shape different, no hole under its own shape. */
function problems(level: ShapeSorterLevel): string[] {
  const found: string[] = [];
  const shapes = level.pieces.map((piece) => piece.shape);
  if (new Set(shapes).size !== shapes.length) found.push('a shape repeats');
  if ([...level.holes].toSorted().join() !== [...shapes].toSorted().join())
    found.push('the holes do not match the shapes');
  if (level.holes.some((hole, index) => hole === shapes[index])) found.push('a hole sits under its own shape');
  if (new Set(level.pieces.map((piece) => piece.paint)).size !== level.pieces.length)
    found.push('two pieces share a paint');
  return found;
}

/** The most look-alikes any one shape in the round has among the others. */
function mostAlike(level: ShapeSorterLevel): number {
  const shapes = level.pieces.map((piece) => piece.shape);
  return Math.max(...shapes.map((shape) => shapes.filter((other) => lookAlike(shape, other)).length));
}

const BASIC = ['circle', 'square', 'triangle'];
const COMMON = [...BASIC, 'heart', 'rectangle', 'star'];

describe('generateLevel', () => {
  // The design table: shapes, the shapes they come from, and how many look alike.
  it.each([
    [1, 2, BASIC, 0],
    [2, 3, BASIC, 0],
    [3, 3, COMMON, 0],
    [4, 4, COMMON, 0],
    [5, 4, SHAPE_KINDS, 1],
    [6, 5, SHAPE_KINDS, 1],
    [7, 5, SHAPE_KINDS, 2],
    [8, 6, SHAPE_KINDS, 2],
  ] as const)('at difficulty %i gives %i fair shapes', (difficulty, count, pool, alike) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.pieces).toHaveLength(count);
      for (const piece of level.pieces) expect(pool as readonly string[]).toContain(piece.shape);
      // No look-alikes at all, or at least the tier's number of them.
      expect(alike === 0 ? mostAlike(level) === 0 : mostAlike(level) >= alike, `seed ${String(seed)}`).toBe(true);
    }
  });

  it('uses every shape across the hardest rounds', () => {
    const seen = new Set(
      SEEDS.flatMap((seed) => generateLevel(seed, MAX_DIFFICULTY, 'band-6-8').pieces.map((piece) => piece.shape)),
    );
    expect([...seen].toSorted()).toEqual([...SHAPE_KINDS].toSorted());
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(3, 4, 'band-3-5')).toEqual(generateLevel(3, 4, 'band-3-5'));
    expect(generateLevel(3, 4, 'band-3-5')).not.toEqual(generateLevel(4, 4, 'band-3-5'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(
      `Shape sorter has difficulty 1 to 8, not ${String(difficulty)}.`,
    );
  });
});

describe('FORMS', () => {
  // The smallest side of a shape is the smallest part of a target the child aims at.
  it('keeps every side of every shape at least three quarters of a square', () => {
    for (const shape of SHAPE_KINDS) {
      expect(Math.min(FORMS[shape].width, FORMS[shape].height)).toBeGreaterThanOrEqual(75);
    }
  });
});

describe('holeOrder', () => {
  /** A generator whose shuffle never moves anything. */
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

  it('moves every hole by one place when shuffling keeps failing', () => {
    const shapes: ShapeKind[] = ['circle', 'square', 'triangle'];
    expect(holeOrder(still, shapes)).toEqual(['square', 'triangle', 'circle']);
  });
});
