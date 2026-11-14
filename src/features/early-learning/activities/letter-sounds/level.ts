import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { ALPHABET, sameSound, similarSound, type Letter } from '../../reading/alphabet.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';

/**
 * Letter sounds: the child hears a letter's sound and picks the letter. Difficulty adds choices,
 * widens the letters from the first ones taught to the whole alphabet, and then offers letters
 * whose sounds are close, such as b and p.
 */

/** The letters most early phonics programs teach first: clear sounds, distinct shapes. */
const FIRST_LETTERS: readonly Letter[] = ['m', 's', 'a', 't', 'p', 'i', 'n'];
/** The common consonants and the other short vowels. */
const COMMON_LETTERS: readonly Letter[] = [
  ...FIRST_LETTERS,
  ...(['o', 'd', 'g', 'c', 'k', 'e', 'h', 'r', 'f', 'l', 'b', 'u'] as const),
];
/** Everything but q and x, whose sounds are two sounds. */
const MOST_LETTERS: readonly Letter[] = [...COMMON_LETTERS, ...(['j', 'v', 'w', 'y', 'z'] as const)];

interface Tier {
  readonly choices: number;
  readonly letters: readonly Letter[];
  /** How many wrong letters have a sound close to the answer's. */
  readonly similar: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { choices: 2, letters: FIRST_LETTERS, similar: 0 },
  { choices: 3, letters: FIRST_LETTERS, similar: 0 },
  { choices: 3, letters: COMMON_LETTERS, similar: 0 },
  { choices: 4, letters: COMMON_LETTERS, similar: 0 },
  { choices: 4, letters: COMMON_LETTERS, similar: 1 },
  { choices: 4, letters: MOST_LETTERS, similar: 1 },
  { choices: 5, letters: MOST_LETTERS, similar: 1 },
  { choices: 5, letters: ALPHABET, similar: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface LetterSoundsLevel {
  /** The letter whose sound the child hears. */
  readonly answer: Letter;
  /** The letters to pick from, in screen order. One of them is the answer. */
  readonly choices: readonly Letter[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Letter sounds has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): LetterSoundsLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const answer = random.pick(tier.letters);
  const choices = chooseWithAnswer(random, answer, {
    pool: tier.letters,
    total: tier.choices,
    clashes: sameSound,
    confusable: similarSound,
    similar: tier.similar,
  });
  return { answer, choices };
}
