import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';
import { FIRST_WORDS, HOMOPHONES, LATER_WORDS, NEXT_WORDS, type SightWord } from './words.ts';

/**
 * Sight words: the child hears a word and finds it written among a few. Difficulty adds words
 * to choose from and moves from the first words a child meets to later ones, then offers wrong
 * words that look like the answer: the same first letter, or the same letters in another order,
 * such as was and saw.
 */

interface Tier {
  readonly choices: number;
  readonly words: readonly SightWord[];
  /** How many wrong words look like the answer. */
  readonly similar: number;
}

const EARLY: readonly SightWord[] = [...FIRST_WORDS, ...NEXT_WORDS];
const ALL: readonly SightWord[] = [...EARLY, ...LATER_WORDS];

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { choices: 3, words: FIRST_WORDS, similar: 0 },
  { choices: 3, words: EARLY, similar: 0 },
  { choices: 4, words: EARLY, similar: 0 },
  { choices: 4, words: EARLY, similar: 1 },
  { choices: 4, words: ALL, similar: 1 },
  { choices: 5, words: ALL, similar: 1 },
  { choices: 5, words: ALL, similar: 2 },
  { choices: 6, words: ALL, similar: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface SightWordsLevel {
  readonly answer: SightWord;
  /** The words to pick from, in screen order. */
  readonly choices: readonly SightWord[];
}

/** Two different words that sound the same. */
export function soundAlike(a: SightWord, b: SightWord): boolean {
  return a !== b && HOMOPHONES.some((group) => group.includes(a) && group.includes(b));
}

/** Two different words a beginning reader mixes up: the same first letter, or the same letters. */
const sortedLetters = (word: string) => word.toLowerCase().split('').toSorted().join('');

export function lookAlike(a: SightWord, b: SightWord): boolean {
  if (a === b) return false;
  return a.charAt(0).toLowerCase() === b.charAt(0).toLowerCase() || sortedLetters(a) === sortedLetters(b);
}

export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Sight words has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SightWordsLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const answer = random.pick(tier.words);
  const choices = chooseWithAnswer(random, answer, {
    pool: tier.words,
    total: tier.choices,
    clashes: soundAlike,
    confusable: lookAlike,
    similar: tier.similar,
  });
  return { answer, choices };
}
