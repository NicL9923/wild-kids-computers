import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Color match: toys in a few colors and one box per color. The child puts each toy in the box of
 * its color. Difficulty adds boxes and toys in small steps, then puts colors side by side that
 * young children mix up, such as red and orange.
 */

/** The colors a round can use. Black, white, and gray are left out: they barely show on the page. */
export const MATCH_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown'] as const;
export type MatchColor = (typeof MATCH_COLORS)[number];

/** Neighbors on the color wheel, or colors close in lightness, that young children mix up. */
const NEAR_COLORS: readonly (readonly [MatchColor, MatchColor])[] = [
  ['red', 'orange'],
  ['red', 'pink'],
  ['red', 'brown'],
  ['orange', 'yellow'],
  ['orange', 'brown'],
  ['blue', 'purple'],
  ['purple', 'pink'],
];

export function areNear(a: MatchColor, b: MatchColor): boolean {
  return NEAR_COLORS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** The toys a round can show. Kinds vary within a round, so color is the only thing that matches. */
export const TOY_KINDS = ['ball', 'balloon', 'block', 'cup'] as const;
export type ToyKind = (typeof TOY_KINDS)[number];

interface Tier {
  readonly colors: number;
  readonly toys: number;
  /** Whether the round puts two colors that are easy to mix up side by side. */
  readonly near: boolean;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { colors: 2, toys: 2, near: false },
  { colors: 2, toys: 3, near: false },
  { colors: 3, toys: 3, near: false },
  { colors: 3, toys: 4, near: false },
  { colors: 3, toys: 5, near: true },
  { colors: 4, toys: 5, near: true },
  { colors: 4, toys: 6, near: true },
  { colors: 5, toys: 6, near: true },
];

export const MAX_DIFFICULTY = TIERS.length;

export type ToyId = `toy-${number}`;

interface Toy {
  readonly id: ToyId;
  readonly color: MatchColor;
  readonly kind: ToyKind;
}

export interface ColorMatchLevel {
  /** One box per color, in screen order. */
  readonly boxes: readonly MatchColor[];
  /** The toys in screen order. Every box gets at least one. */
  readonly toys: readonly Toy[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Color match has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/**
 * `count` colors. With `near`, at least two of them are easy to mix up; without, none are. Green
 * is near nothing, so three colors with no close pair can always be found.
 */
function pickColors(random: Random, count: number, near: boolean): MatchColor[] {
  const chosen: MatchColor[] = near ? [...random.pick(NEAR_COLORS)] : [];
  for (const color of random.shuffle(MATCH_COLORS)) {
    if (chosen.length === count) break;
    if (chosen.includes(color)) continue;
    if (!near && chosen.some((other) => areNear(other, color))) continue;
    chosen.push(color);
  }
  return random.shuffle(chosen);
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): ColorMatchLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const boxes = pickColors(random, tier.colors, tier.near);
  // Every box gets a toy, and the rest go to any box.
  const colors = [...boxes, ...Array.from({ length: tier.toys - boxes.length }, () => random.pick(boxes))];
  const toys = random
    .shuffle(colors)
    .map((color, index): Toy => ({ id: `toy-${index}`, color, kind: random.pick(TOY_KINDS) }));
  return { boxes, toys };
}
