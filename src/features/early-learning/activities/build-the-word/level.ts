import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { strings as emojiNames } from '../../../../core/strings/shared/emoji.ts';
import { ALPHABET, lettersOf, lookAlike, sameSound, similarSound, type Letter } from '../../reading/alphabet.ts';
import { LONGER_WORDS, SHORT_WORDS, type BuildWord } from './words.ts';

/**
 * Build the word: a picture, empty boxes, one per letter, and letter tiles to put in them. The
 * easiest rounds show each letter faintly in its box, so a child matches shapes while hearing
 * the sounds. Then the guide goes, spare tiles join, and words grow from three letters to six.
 */

interface Tier {
  /** The shortest and longest word. */
  readonly length: readonly [number, number];
  /** Each box shows its letter faintly. */
  readonly guide: boolean;
  /** Tiles that belong in no box. */
  readonly spare: number;
  /** Spare tiles look or sound like a letter of the word. */
  readonly similar: boolean;
}

/** One entry per difficulty, 1 first. */
export const TIERS: readonly Tier[] = [
  { length: [3, 3], guide: true, spare: 0, similar: false },
  { length: [3, 3], guide: true, spare: 1, similar: false },
  { length: [3, 3], guide: false, spare: 0, similar: false },
  { length: [3, 3], guide: false, spare: 1, similar: false },
  { length: [4, 4], guide: false, spare: 1, similar: false },
  { length: [4, 4], guide: false, spare: 2, similar: true },
  { length: [4, 5], guide: false, spare: 2, similar: true },
  { length: [4, 6], guide: false, spare: 3, similar: true },
];

export const MAX_DIFFICULTY = TIERS.length;

export const WORDS: readonly BuildWord[] = [...SHORT_WORDS, ...LONGER_WORDS];

export type TileId = `tile-${number}`;

export interface Tile {
  readonly id: TileId;
  readonly letter: Letter;
}

export interface BuildTheWordLevel {
  readonly word: BuildWord;
  /** The word's letters in order: box n takes letters[n]. */
  readonly letters: readonly Letter[];
  readonly guide: boolean;
  /** The tiles in screen order: one per letter of the word, and the spares. */
  readonly tiles: readonly Tile[];
}

export function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Build the word has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

export function lettersOfWord(word: BuildWord): Letter[] {
  return lettersOf(emojiNames[word].text);
}

/**
 * Letters that can be spare tiles for a word: not in the word, and not a letter that says the
 * same sound as one in it, so k is never spare in cat, where a child spelling by ear could fairly
 * put it. With `similar`, letters that look or sound like one in the word come first.
 */
export function spareLetters(letters: readonly Letter[], similar: boolean): { near: Letter[]; far: Letter[] } {
  const allowed = ALPHABET.filter(
    (letter) => !letters.includes(letter) && letters.every((own) => !sameSound(own, letter)),
  );
  const isNear = (letter: Letter) => letters.some((own) => lookAlike(own, letter) || similarSound(own, letter));
  return similar
    ? { near: allowed.filter(isNear), far: allowed.filter((letter) => !isNear(letter)) }
    : { near: [], far: allowed.filter((letter) => !isNear(letter)) };
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): BuildTheWordLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const [shortest, longest] = tier.length;
  const word = random.pick(
    WORDS.filter((each) => {
      const length = emojiNames[each].text.length;
      return length >= shortest && length <= longest;
    }),
  );
  const letters = lettersOfWord(word);
  const { near, far } = spareLetters(letters, tier.similar);
  const nearCount = Math.min(near.length, tier.spare === 0 ? 0 : tier.spare - 1);
  const spares = [...random.sample(near, nearCount), ...random.sample(far, tier.spare - nearCount)];
  let order = random.shuffle([...letters, ...spares]);
  // Tiles that already spell the word left to right leave nothing to build: swap the word's first
  // two tiles. No word starts with a doubled letter, so the swap always changes the order.
  const ofWord = order.flatMap((letter, index) => (letters.includes(letter) ? [index] : []));
  const [first, second] = ofWord;
  const [firstLetter, secondLetter] = letters;
  const spelled = ofWord.map((index) => order[index]).join('') === letters.join('');
  if (spelled && first !== undefined && second !== undefined && firstLetter && secondLetter) {
    order = order.with(first, secondLetter).with(second, firstLetter);
  }
  const tiles = order.map((letter, index): Tile => ({ id: `tile-${index}`, letter }));
  return { word, letters, guide: tier.guide, tiles };
}
