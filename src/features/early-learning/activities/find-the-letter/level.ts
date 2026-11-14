import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { ALPHABET, lookAlike, type Letter, type LetterCase } from '../../reading/alphabet.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';

/**
 * Find the letter: the child hears a letter's name and finds it among others. Difficulty adds
 * letters to search, then brings in letters that look alike, such as b, d, p, and q. Lowercase
 * comes first, because it is most of what a child reads. Capitals come at the top of band-6-8.
 */

/** Lowercase letters with shapes unlike each other, for the first rounds. */
const FIRST_LETTERS: readonly Letter[] = ['a', 'b', 'e', 'k', 'm', 'o', 's', 't', 'x', 'z'];

interface Tier {
  readonly choices: number;
  readonly letters: readonly Letter[];
  readonly letterCase: LetterCase;
  /** How many wrong letters look like the answer. */
  readonly similar: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { choices: 2, letters: FIRST_LETTERS, letterCase: 'lower', similar: 0 },
  { choices: 3, letters: FIRST_LETTERS, letterCase: 'lower', similar: 0 },
  { choices: 3, letters: ALPHABET, letterCase: 'lower', similar: 0 },
  { choices: 4, letters: ALPHABET, letterCase: 'lower', similar: 0 },
  { choices: 4, letters: ALPHABET, letterCase: 'lower', similar: 1 },
  { choices: 5, letters: ALPHABET, letterCase: 'lower', similar: 2 },
  { choices: 6, letters: ALPHABET, letterCase: 'lower', similar: 3 },
  { choices: 4, letters: ALPHABET, letterCase: 'upper', similar: 1 },
  { choices: 6, letters: ALPHABET, letterCase: 'upper', similar: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface FindTheLetterLevel {
  /** The letter the child hears named. */
  readonly answer: Letter;
  /** The letters to search, in screen order. One of them is the answer. */
  readonly choices: readonly Letter[];
  /** Every letter in a round is shown in this case, so two never match one name. */
  readonly letterCase: LetterCase;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Find the letter has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FindTheLetterLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const answer = random.pick(tier.letters);
  const choices = chooseWithAnswer(random, answer, {
    pool: tier.letters,
    total: tier.choices,
    // Every letter has its own name, so no two letters clash.
    clashes: () => false,
    confusable: (a, b) => lookAlike(a, b, tier.letterCase),
    similar: tier.similar,
  });
  return { answer, choices, letterCase: tier.letterCase };
}
