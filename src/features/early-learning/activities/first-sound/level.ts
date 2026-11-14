import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { isLetter, sameSound, similarSound, VOWELS, type Letter } from '../../reading/alphabet.ts';
import { chooseWithAnswer } from '../../reading/choices.ts';
import { WORDS, type FirstSoundWord } from './words.ts';

/**
 * First sound: a picture, its spoken name, and letters to pick the first sound from. Difficulty
 * adds letters, then words that start with a short vowel, which is harder to hear on its own,
 * then a letter whose sound is close to the answer's, such as d and t. Each sound has at most one
 * close neighbor among the first letters, so harder rounds add letters rather than more of those.
 */

/** The letter a picture's name starts with. Throws for a name that starts with anything else. */
export function firstLetter(word: FirstSoundWord): Letter {
  const first = emojiNames[word].text.charAt(0);
  if (!isLetter(first)) throw new RangeError(`"${word}" does not start with a lowercase letter.`);
  return first;
}

interface Tier {
  readonly choices: number;
  readonly vowels: boolean;
  /** How many wrong letters have a sound close to the answer's. */
  readonly similar: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { choices: 2, vowels: false, similar: 0 },
  { choices: 3, vowels: false, similar: 0 },
  { choices: 3, vowels: true, similar: 0 },
  { choices: 4, vowels: true, similar: 0 },
  { choices: 4, vowels: true, similar: 1 },
  { choices: 5, vowels: true, similar: 1 },
  { choices: 6, vowels: true, similar: 1 },
];

export const MAX_DIFFICULTY = TIERS.length;

/** Every letter some picture starts with. Wrong answers come from these too. */
export const START_LETTERS: readonly Letter[] = [...new Set(WORDS.map(firstLetter))].toSorted();

export interface FirstSoundLevel {
  readonly word: FirstSoundWord;
  /** The letter the word starts with. */
  readonly answer: Letter;
  /** The letters to pick from, in screen order. */
  readonly choices: readonly Letter[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`First sound has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Pure. The letter comes first, then a word for it, so every letter comes up as often. */
export function generateLevel(seed: number, difficulty: number, _band: Band): FirstSoundLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const letters = START_LETTERS.filter((letter) => tier.vowels || !VOWELS.includes(letter));
  const answer = random.pick(letters);
  const word = random.pick(WORDS.filter((each) => firstLetter(each) === answer));
  const choices = chooseWithAnswer(random, answer, {
    pool: START_LETTERS,
    total: tier.choices,
    clashes: sameSound,
    confusable: similarSound,
    similar: tier.similar,
  });
  return { word, answer, choices };
}
