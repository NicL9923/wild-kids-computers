import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';
import type { ShapeKind, ShapePaint } from '../../shapes/shapes.ts';

/**
 * Shape sorter: a few shapes and a lid with one hole per shape. The child puts each shape in
 * the hole it fits. Difficulty adds shapes, widens them from circle, square, and triangle to
 * nine shapes, and then puts shapes side by side that look alike, such as a square and a
 * rectangle.
 */

const BASIC: readonly ShapeKind[] = ['circle', 'square', 'triangle'];
const COMMON: readonly ShapeKind[] = [...BASIC, 'rectangle', 'heart', 'star'];
const ALL: readonly ShapeKind[] = [...COMMON, 'oval', 'diamond', 'hexagon'];

/** Shapes a young child mixes up. */
const ALIKE: readonly (readonly [ShapeKind, ShapeKind])[] = [
  ['circle', 'oval'],
  ['circle', 'hexagon'],
  ['square', 'rectangle'],
  ['square', 'diamond'],
];

export function lookAlike(a: ShapeKind, b: ShapeKind): boolean {
  return ALIKE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Each shape's box, with 100 as the size of a square. Each is drawn the way a child meets it:
 * a wide rectangle and oval, a tall diamond, so no two shapes are the same shape in another size.
 */
export const FORMS: Readonly<Record<ShapeKind, { readonly width: number; readonly height: number }>> = {
  circle: { width: 100, height: 100 },
  square: { width: 92, height: 92 },
  triangle: { width: 110, height: 96 },
  rectangle: { width: 136, height: 76 },
  oval: { width: 136, height: 86 },
  diamond: { width: 80, height: 118 },
  heart: { width: 106, height: 96 },
  star: { width: 108, height: 104 },
  hexagon: { width: 112, height: 98 },
};

/** Bright paints, so every piece stands out from the dark holes. */
const PIECE_PAINTS: readonly ShapePaint[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

interface Tier {
  readonly shapes: number;
  readonly pool: readonly ShapeKind[];
  /** How many shapes look like the first one. 0 means no two shapes in the round look alike. */
  readonly alike: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { shapes: 2, pool: BASIC, alike: 0 },
  { shapes: 3, pool: BASIC, alike: 0 },
  { shapes: 3, pool: COMMON, alike: 0 },
  { shapes: 4, pool: COMMON, alike: 0 },
  { shapes: 4, pool: ALL, alike: 1 },
  { shapes: 5, pool: ALL, alike: 1 },
  { shapes: 5, pool: ALL, alike: 2 },
  { shapes: 6, pool: ALL, alike: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

export type PieceId = `piece-${number}`;

interface Piece {
  readonly id: PieceId;
  readonly shape: ShapeKind;
  readonly paint: ShapePaint;
}

export interface ShapeSorterLevel {
  /** The pieces in screen order. No two share a shape. */
  readonly pieces: readonly Piece[];
  /** One hole per piece, in screen order, never lined up under its own piece. */
  readonly holes: readonly ShapeKind[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Shape sorter has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The holes in an order where no hole sits in the same place as its piece. */
export function holeOrder(random: Random, shapes: readonly ShapeKind[]): ShapeKind[] {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const order = random.shuffle(shapes);
    if (order.every((shape, index) => shape !== shapes[index])) return order;
  }
  // A turn by one place always moves every hole.
  return shapes.map((_, index) => shapes[(index + 1) % shapes.length] ?? shapes[0] ?? 'circle');
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): ShapeSorterLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  // The first shape has enough look-alikes in the pool for the tier.
  const anchors = tier.pool.filter(
    (shape) => tier.pool.filter((other) => lookAlike(shape, other)).length >= tier.alike,
  );
  const shapes = chooseWithAnswer(random, random.pick(anchors), {
    pool: tier.pool,
    total: tier.shapes,
    // With no look-alikes wanted, no two shapes in the round may look alike.
    clashes: (a, b) => tier.alike === 0 && lookAlike(a, b),
    confusable: lookAlike,
    similar: tier.alike,
  });
  const paints = random.sample(PIECE_PAINTS, shapes.length);
  const pieces = shapes.map((shape, index): Piece => ({ id: `piece-${index}`, shape, paint: paints[index] ?? 'red' }));
  return { pieces, holes: holeOrder(random, shapes) };
}
