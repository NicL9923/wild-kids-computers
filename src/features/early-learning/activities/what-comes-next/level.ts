import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { strings as colors } from '../../../../core/strings/shared/colors.ts';
import { ALL_PICTURES, type Picture } from '../../logic/pictures.ts';

/**
 * What comes next: a row of pictures or shapes that repeat a short unit, such as apple, banana,
 * apple, banana, and an empty box at the end. The child picks what goes in the box.
 *
 * The row always shows the unit at least twice in full, starting from its first item. Then every
 * unit that repeats twice in the row gives the same next item, so a level has exactly one right
 * continuation; the level test checks this for every row. Difficulty lengthens the unit and adds
 * kinds of items, a little at a time.
 */

/** Shapes, each in its own color, so a shape is never told apart by color alone. */
export const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond'] as const;

export type ShapeId = (typeof SHAPES)[number];

/** Each shape keeps one color, so the shape and the color both tell it apart. */
export const SHAPE_COLORS = {
  circle: 'red',
  square: 'blue',
  triangle: 'yellow',
  star: 'green',
  heart: 'purple',
  diamond: 'orange',
} as const satisfies Readonly<Record<ShapeId, keyof typeof colors>>;

type PatternKind = 'pictures' | 'shapes';

/** A pattern unit written as letters, one letter per kind of item: "aab" is two of one, then one of another. */
type Unit = string;

interface Tier {
  readonly units: readonly Unit[];
  /** The fewest and most items the row shows before the empty box. */
  readonly shown: readonly [min: number, max: number];
  /** Choices offered, the answer included. */
  readonly choices: number;
}

/** One entry per difficulty, 1 first. Each step lengthens the unit or adds a choice, never both. */
const TIERS: readonly Tier[] = [
  { units: ['ab'], shown: [4, 5], choices: 3 },
  { units: ['ab'], shown: [4, 7], choices: 3 },
  { units: ['aab', 'abb'], shown: [6, 8], choices: 3 },
  { units: ['abc'], shown: [6, 8], choices: 3 },
  { units: ['aabb', 'abbc', 'aabc', 'abcc'], shown: [8, 10], choices: 3 },
  { units: ['abcd', 'aabb', 'abbc'], shown: [8, 10], choices: 4 },
  { units: ['aabbc', 'abcde', 'abacd'], shown: [10, 12], choices: 4 },
  { units: ['aabbcc', 'abcdef', 'aabcdd'], shown: [12, 13], choices: 4 },
];

export const MAX_DIFFICULTY = TIERS.length;

export type PatternItem = Picture | ShapeId;

export const isShape = (item: PatternItem): item is ShapeId => (SHAPES as readonly string[]).includes(item);

export interface WhatComesNextLevel {
  readonly kind: PatternKind;
  /** The repeating unit as letters, such as "aab". */
  readonly unit: Unit;
  /** The row before the empty box. */
  readonly shown: readonly PatternItem[];
  readonly answer: PatternItem;
  /** In screen order. The answer is one of them, and every item of the unit is too. */
  readonly choices: readonly PatternItem[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`What comes next has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The item at `index`. Throws past the end, which is a mistake in this file's tables. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`No item at ${String(index)} of ${String(items.length)}.`);
  return item;
}

/** Pure: the same seed and difficulty give the same row. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): WhatComesNextLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const unit = random.pick(tier.units);
  const kind: PatternKind = random.pick(['pictures', 'shapes'] as const);
  const pool: readonly PatternItem[] = kind === 'pictures' ? ALL_PICTURES : SHAPES;
  // One item per letter, in order of first appearance, and the distractors after them. They come
  // from one draw, so none repeats.
  const kinds = [...new Set(unit.split(''))];
  const drawn = random.sample(pool, Math.max(kinds.length, tier.choices));
  const length = random.int(Math.max(tier.shown[0], unit.length * 2), tier.shown[1]);
  const sequence = Array.from({ length: length + 1 }, (_, index) =>
    at(drawn, kinds.indexOf(at(unit.split(''), index % unit.length))),
  );
  return {
    kind,
    unit,
    shown: sequence.slice(0, length),
    answer: at(sequence, length),
    choices: random.shuffle(drawn),
  };
}
