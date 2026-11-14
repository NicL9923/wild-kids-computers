import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import {
  ALPHABET,
  lettersOf,
  lookAlike,
  sameSound,
  similarSound,
  VOWELS,
  type Letter,
} from '../../reading/alphabet.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';
import { FOUR_LETTER_WORDS, LONG_WORDS, SHORT_WORDS, type MissingLetterWord } from './words.ts';

/**
 * Missing letter: a picture, its word with one letter gone, and letters to fill the gap. The
 * first rounds take the first letter of a three-letter word, then the last, then the vowel in
 * the middle, which is hardest to hear. Then words grow, and the wrong letters come to look or
 * sound like the right one.
 */

type Gap = 'first' | 'last' | 'middle' | 'any';

interface Tier {
  readonly words: readonly MissingLetterWord[];
  readonly gap: Gap;
  readonly choices: number;
  /** How many wrong letters look or sound like the answer. */
  readonly similar: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { words: SHORT_WORDS, gap: 'first', choices: 3, similar: 0 },
  { words: SHORT_WORDS, gap: 'last', choices: 3, similar: 0 },
  { words: SHORT_WORDS, gap: 'middle', choices: 3, similar: 0 },
  { words: SHORT_WORDS, gap: 'any', choices: 4, similar: 0 },
  { words: FOUR_LETTER_WORDS, gap: 'any', choices: 4, similar: 0 },
  { words: FOUR_LETTER_WORDS, gap: 'any', choices: 4, similar: 1 },
  { words: LONG_WORDS, gap: 'any', choices: 5, similar: 1 },
  { words: LONG_WORDS, gap: 'any', choices: 5, similar: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface MissingLetterLevel {
  readonly word: MissingLetterWord;
  readonly letters: readonly Letter[];
  /** The index of the letter left out. */
  readonly gap: number;
  /** The letter left out. */
  readonly answer: Letter;
  /** The letters to pick from, in screen order. */
  readonly choices: readonly Letter[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Missing letter has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

function gapIndex(gap: Gap, length: number, pick: () => number): number {
  if (gap === 'first') return 0;
  if (gap === 'last') return length - 1;
  if (gap === 'middle') return Math.floor(length / 2);
  return pick();
}

/** A vowel's stand-ins are the other vowels; a consonant's are the common consonants. */
const CONSONANTS: readonly Letter[] = ALPHABET.filter(
  (letter) => !VOWELS.includes(letter) && letter !== 'q' && letter !== 'x',
);

/**
 * A wrong letter a child could mix up with the answer: a close sound, or for a consonant a
 * look-alike shape. Vowel shapes are not counted, so a vowel gap still has enough letters.
 */
export function confusable(answer: Letter, other: Letter): boolean {
  return similarSound(answer, other) || (!VOWELS.includes(answer) && lookAlike(answer, other));
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MissingLetterLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const word = random.pick(tier.words);
  const letters = lettersOf(emojiNames[word].text);
  const gap = gapIndex(tier.gap, letters.length, () => random.int(0, letters.length - 1));
  const answer = letters[gap];
  if (answer === undefined) throw new RangeError(`No letter ${String(gap)} in ${word}.`);
  const choices = chooseWithAnswer(random, answer, {
    pool: VOWELS.includes(answer) ? VOWELS : CONSONANTS,
    total: tier.choices,
    clashes: sameSound,
    confusable,
    similar: tier.similar,
  });
  return { word, letters, gap, answer, choices };
}
