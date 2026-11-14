import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';

/**
 * Fractions: a fraction and pictures of shapes cut into parts, some shaded. In one kind of round
 * the child finds the picture for a fraction; in the other, the fraction for a picture. Every
 * wrong choice has a different value from the answer, so 2/4 never competes with 1/2. Difficulty
 * starts with one part of halves, thirds, and fourths, adds more parts and more shaded, then
 * shades parts that are not side by side, and at the top offers a shape cut into parts that are
 * not equal, which never shows a fraction.
 */

type Mode = 'pick-picture' | 'pick-fraction';
export type Shape = 'circle' | 'bar' | 'grid';

export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

interface Tier {
  readonly mode: Mode;
  readonly denominators: readonly number[];
  /** Only one part shaded. */
  readonly unit: boolean;
  /** Shaded parts are side by side, or anywhere. */
  readonly shading: 'together' | 'anywhere';
  readonly choices: 3 | 4;
  /** Offers a picture with parts that are not equal. */
  readonly unequal: boolean;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { mode: 'pick-picture', denominators: [2, 3, 4], unit: true, shading: 'together', choices: 3, unequal: false },
  { mode: 'pick-picture', denominators: [2, 3, 4, 6, 8], unit: true, shading: 'together', choices: 3, unequal: false },
  { mode: 'pick-picture', denominators: [3, 4], unit: false, shading: 'together', choices: 3, unequal: false },
  { mode: 'pick-picture', denominators: [2, 3, 4, 5, 6], unit: false, shading: 'together', choices: 4, unequal: true },
  { mode: 'pick-fraction', denominators: [2, 3, 4], unit: false, shading: 'together', choices: 3, unequal: false },
  {
    mode: 'pick-fraction',
    denominators: [2, 3, 4, 5, 6, 8],
    unit: false,
    shading: 'together',
    choices: 4,
    unequal: false,
  },
  {
    mode: 'pick-picture',
    denominators: [2, 3, 4, 5, 6, 8],
    unit: false,
    shading: 'anywhere',
    choices: 4,
    unequal: true,
  },
  {
    mode: 'pick-fraction',
    denominators: [2, 3, 4, 5, 6, 8],
    unit: false,
    shading: 'anywhere',
    choices: 4,
    unequal: false,
  },
];

export const MAX_FRACTION_DIFFICULTY = TIERS.length;

/** The denominators a grid can show: 2 by 2, 2 by 3, and 2 by 4. */
const GRID_DENOMINATORS = [4, 6, 8];

/**
 * How much larger the first part of an unequal shape is than an equal part, and the largest
 * share it may take, so halves become three quarters and one quarter rather than a sliver.
 */
const UNEQUAL_GROWTH = 1.8;
const UNEQUAL_MOST = 0.75;

/**
 * Unequal parts only for halves, thirds, and fourths. With more parts the larger first part is
 * too close to an equal one to see, and the shaded share too close to the target's.
 */
const UNEQUAL_MOST_PARTS = 4;

export interface Picture {
  readonly id: string;
  readonly shape: Shape;
  /** The share of the whole each part takes, in order; equal parts unless `fraction` is null. */
  readonly parts: readonly number[];
  readonly shaded: readonly number[];
  /** The fraction the picture shows, or null for parts that are not equal. */
  readonly fraction: Fraction | null;
}

export interface FractionLevel {
  readonly mode: Mode;
  readonly target: Fraction;
  /** For `pick-picture`, the pictures to choose from; for `pick-fraction`, the one picture. */
  readonly pictures: readonly Picture[];
  /** For `pick-fraction`, the fractions to choose from, smallest first; otherwise empty. */
  readonly fractions: readonly Fraction[];
  /** The id of the right picture, or the key of the right fraction. */
  readonly answer: string;
}

export const fractionKey = (fraction: Fraction) => `${String(fraction.numerator)}/${String(fraction.denominator)}`;

/** Whether two fractions have the same value, such as 1/2 and 2/4. */
export const sameValue = (a: Fraction, b: Fraction) => a.numerator * b.denominator === b.numerator * a.denominator;

/** The tier for a difficulty. Throws outside 1 to MAX_FRACTION_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Fractions has difficulty 1 to ${String(MAX_FRACTION_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/** Every fraction the tier can use, between 0 and 1. */
export function fractionsFor(tier: Tier): Fraction[] {
  return tier.denominators.flatMap((denominator) =>
    Array.from({ length: tier.unit ? 1 : denominator - 1 }, (_, index) => ({ numerator: index + 1, denominator })),
  );
}

/**
 * Wrong fractions, `count` of them, each with a different value from the target and from each
 * other. The likely confusions come first: the same parts with a different number shaded, the
 * same number shaded of different parts, and the unshaded share.
 */
export function wrongFractions(random: Random, target: Fraction, all: readonly Fraction[], count: number): Fraction[] {
  const likely = all.filter(
    (other) =>
      other.denominator === target.denominator ||
      other.numerator === target.numerator ||
      other.numerator === target.denominator - target.numerator,
  );
  const chosen: Fraction[] = [];
  for (const pool of [random.shuffle(likely), random.shuffle(all)]) {
    for (const candidate of pool) {
      if (chosen.length === count) break;
      if ([target, ...chosen].some((other) => sameValue(other, candidate))) continue;
      chosen.push(candidate);
    }
  }
  if (chosen.length < count) {
    throw new RangeError(
      `Fractions needs ${String(count)} wrong choices for ${fractionKey(target)}, found ${String(chosen.length)}.`,
    );
  }
  return chosen;
}

/** Which parts are shaded: the first ones, or any of them. */
function shade(random: Random, fraction: Fraction, shading: Tier['shading']): number[] {
  const indexes = Array.from({ length: fraction.denominator }, (_, index) => index);
  if (shading === 'together') return indexes.slice(0, fraction.numerator);
  return random.sample(indexes, fraction.numerator);
}

/** A shape cut into equal parts, with the fraction's share shaded. */
function equalPicture(random: Random, id: string, shape: Shape, fraction: Fraction, shading: Tier['shading']): Picture {
  const parts = Array.from({ length: fraction.denominator }, () => 1 / fraction.denominator);
  return { id, shape, parts, shaded: shade(random, fraction, shading), fraction };
}

/**
 * The same number of parts as the target, but the first part larger than the rest. Its first
 * part and the next ones up to the target's numerator are shaded, which is never the target's
 * share of the whole.
 */
export function unequalPicture(id: string, shape: Shape, target: Fraction): Picture {
  const first = Math.min(UNEQUAL_GROWTH / target.denominator, UNEQUAL_MOST);
  const rest = (1 - first) / (target.denominator - 1);
  const parts = Array.from({ length: target.denominator }, (_, index) => (index === 0 ? first : rest));
  return { id, shape, parts, shaded: Array.from({ length: target.numerator }, (_, index) => index), fraction: null };
}

/** The shapes every fraction in the round can be drawn as. */
function shapesFor(fractions: readonly Fraction[]): Shape[] {
  const grid = fractions.every((fraction) => GRID_DENOMINATORS.includes(fraction.denominator));
  return grid ? ['circle', 'bar', 'grid'] : ['circle', 'bar'];
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FractionLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const all = fractionsFor(tier);
  const target = random.pick(all);
  const wrong = wrongFractions(random, target, all, tier.choices - 1);
  if (tier.mode === 'pick-fraction') {
    const shape = random.pick(shapesFor([target]));
    const fractions = [target, ...wrong].toSorted((a, b) => a.numerator / a.denominator - b.numerator / b.denominator);
    return {
      mode: tier.mode,
      target,
      pictures: [equalPicture(random, 'picture-0', shape, target, tier.shading)],
      fractions,
      answer: fractionKey(target),
    };
  }
  // Pictures all share one shape, so the fraction is the only difference between them.
  const offerUnequal = tier.unequal && target.denominator <= UNEQUAL_MOST_PARTS;
  const shown = offerUnequal ? wrong.slice(0, -1) : wrong;
  const shape = random.pick(shapesFor([target, ...shown]).filter((each) => !offerUnequal || each !== 'grid'));
  const order = random.shuffle([target, ...shown, null]).filter((each) => each !== null || offerUnequal);
  const pictures = order.map((fraction, index) => {
    const id = `picture-${String(index)}`;
    return fraction === null
      ? unequalPicture(id, shape, target)
      : equalPicture(random, id, shape, fraction, tier.shading);
  });
  return { mode: tier.mode, target, pictures, fractions: [], answer: `picture-${String(order.indexOf(target))}` };
}
