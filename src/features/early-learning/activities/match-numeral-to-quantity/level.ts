import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { pickChoices } from '../../math/choices.ts';

/**
 * Match the number: a numeral, and groups of one kind of thing. One group has that many. The
 * others are near it, so the child counts instead of guessing. Difficulty raises the numbers,
 * adds a group, and brings the wrong groups closer to the right one.
 */

interface Tier {
  /** The smallest and largest number to find. */
  readonly min: number;
  readonly max: number;
  readonly groups: number;
  /** How far, at least, a wrong group is from the right one. */
  readonly gap: number;
}

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { min: 1, max: 3, groups: 2, gap: 2 },
  { min: 1, max: 4, groups: 2, gap: 1 },
  { min: 1, max: 5, groups: 3, gap: 1 },
  { min: 2, max: 6, groups: 3, gap: 1 },
  { min: 3, max: 8, groups: 3, gap: 1 },
  { min: 4, max: 10, groups: 3, gap: 1 },
  { min: 5, max: 12, groups: 3, gap: 1 },
  { min: 6, max: 15, groups: 4, gap: 1 },
];

export const MAX_MATCH_DIFFICULTY = TIERS.length;

/** How far, at most, a wrong group is from the right one. */
const SPREAD = 3;

/** Things to count. One kind per round, all one size, so only the number differs. */
export const THINGS = [
  'apple',
  'strawberry',
  'ladybug',
  'duck',
  'fish',
  'butterfly',
  'carrot',
  'soccer-ball',
  'balloon',
  'cupcake',
] as const satisfies readonly EmojiId[];

interface Group {
  readonly id: string;
  readonly count: number;
}

export interface MatchLevel {
  /** The number to find. */
  readonly target: number;
  readonly kind: (typeof THINGS)[number];
  /** The groups in the order they appear. Exactly one has `target` things. */
  readonly groups: readonly Group[];
  /** The id of the group with `target` things. */
  readonly answer: string;
}

/** The tier for a difficulty. Throws outside 1 to MAX_MATCH_DIFFICULTY. */
export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(
      `Match the number has difficulty 1 to ${String(MAX_MATCH_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return tier;
}

/** Wrong counts from `gap` to SPREAD away from the target, at least 1, and at most two past the tier. */
export function wrongCounts(target: number, tier: Tier): number[] {
  const found: number[] = [];
  for (let count = 1; count <= tier.max + 2; count += 1) {
    const distance = Math.abs(count - target);
    if (distance >= tier.gap && distance <= SPREAD) found.push(count);
  }
  return found;
}

/** Pure: the same seed, difficulty, and band give the same round. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MatchLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const target = random.int(tier.min, tier.max);
  const kind = random.pick(THINGS);
  const counts = random.shuffle(pickChoices(random, target, tier.groups, wrongCounts(target, tier)));
  const groups = counts.map((count, index) => ({ id: `group-${String(index)}`, count }));
  return { target, kind, groups, answer: `group-${String(counts.indexOf(target))}` };
}
