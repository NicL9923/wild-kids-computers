import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { RHYME_SETS, type RhymeSet } from './rhymes.ts';

/**
 * Rhyming pairs: picture cards to match two by two, each pair a rhyme. Difficulty adds pairs,
 * then puts pairs with the same vowel on one board, such as goat and coat beside nose and rose,
 * so the child must listen to the ending as well as the vowel.
 */

interface Tier {
  readonly pairs: number;
  /** Whether two pairs on the board share their vowel sound. */
  readonly sameVowel: boolean;
}

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { pairs: 2, sameVowel: false },
  { pairs: 3, sameVowel: false },
  { pairs: 4, sameVowel: false },
  { pairs: 4, sameVowel: true },
  { pairs: 5, sameVowel: true },
  { pairs: 6, sameVowel: true },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface Card {
  /** The picture, which is also the card's id: no word is in two sets. */
  readonly word: EmojiId;
  /** The rhyme it belongs to. Two cards match when this is the same. */
  readonly rhyme: string;
}

export interface RhymingPairsLevel {
  /** The cards in screen order, two per rhyme. */
  readonly cards: readonly Card[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Rhyming pairs has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Sets with different vowels, one per vowel, as many as asked. */
function distinctVowels(random: Random, from: readonly RhymeSet[], count: number): RhymeSet[] {
  const chosen: RhymeSet[] = [];
  for (const set of random.shuffle(from)) {
    if (chosen.length === count) break;
    if (chosen.every((other) => other.vowel !== set.vowel)) chosen.push(set);
  }
  return chosen;
}

/** The sets on the board: with `sameVowel`, two that share a vowel and the rest all different. */
export function chooseSets(random: Random, tier: Tier): RhymeSet[] {
  const sets: readonly RhymeSet[] = RHYME_SETS;
  if (!tier.sameVowel) return distinctVowels(random, sets, tier.pairs);
  const shared = [...new Set(sets.map((set) => set.vowel))].filter(
    (vowel) => sets.filter((set) => set.vowel === vowel).length >= 2,
  );
  const vowel = random.pick(shared);
  const pair = random.sample(
    sets.filter((set) => set.vowel === vowel),
    2,
  );
  const rest = sets.filter((set) => set.vowel !== vowel);
  return [...pair, ...distinctVowels(random, rest, tier.pairs - 2)];
}

/** Pure: the same seed and difficulty give the same board in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): RhymingPairsLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const cards = chooseSets(random, tier).flatMap((set) =>
    random.sample(set.words, 2).map((word) => ({ word, rhyme: set.rhyme })),
  );
  return { cards: random.shuffle(cards) };
}
