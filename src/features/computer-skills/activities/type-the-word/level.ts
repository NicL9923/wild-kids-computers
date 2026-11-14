import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';
import { isLetter, type Letter } from '../../shared/keyboardLayout.ts';

/**
 * Type the word: a picture and its name, one word at a time. The child types the letters in
 * order. Difficulty adds words, moves from three-letter words to four, and takes away the help on
 * the keyboard picture: first the next key is lit, then only its row, then nothing.
 */

/** How the keyboard picture helps: light the next key, tint its row, or show nothing. */
type WordHelp = 'key' | 'row' | 'none';

/**
 * Three-letter words a child of six can sound out: one short vowel between two consonants, each
 * letter saying its usual sound, and a picture that shows only that word.
 */
export const SHORT_WORDS = [
  'cat',
  'dog',
  'pig',
  'fox',
  'bat',
  'bus',
  'van',
  'bed',
  'cap',
  'map',
  'sun',
  'log',
  'leg',
  'box',
] as const satisfies readonly EmojiId[];

/** Four-letter words with a short vowel and a blend or a common pair such as "sh" or "ck". */
export const LONG_WORDS = [
  'frog',
  'crab',
  'duck',
  'fish',
  'nest',
  'tent',
  'drum',
  'sled',
  'hand',
  'milk',
  'plug',
  'bell',
  'lock',
  'ship',
] as const satisfies readonly EmojiId[];

type TypeWordId = (typeof SHORT_WORDS)[number] | (typeof LONG_WORDS)[number];

type WordPool = 'short' | 'mixed' | 'long';

export interface Step {
  readonly count: number;
  readonly pool: WordPool;
  readonly help: WordHelp;
}

/** One entry per difficulty, 1 first. Each step changes one thing. */
export const STEPS: readonly Step[] = [
  { count: 2, pool: 'short', help: 'key' },
  { count: 3, pool: 'short', help: 'key' },
  { count: 3, pool: 'mixed', help: 'key' },
  { count: 3, pool: 'mixed', help: 'row' },
  { count: 3, pool: 'long', help: 'row' },
  { count: 4, pool: 'long', help: 'none' },
];

export const MAX_WORD_DIFFICULTY = STEPS.length;

/** The pause after a word is typed, so the child sees and hears it whole before the next one. */
export const NEXT_WORD_MS = 1100;

interface TypeWord {
  /** The emoji that shows the word, and whose spoken name says it. */
  readonly id: TypeWordId;
  /** The letters to type, in order. */
  readonly letters: readonly Letter[];
}

export interface TypeWordLevel {
  /** The words to type, in order. No word repeats within a round. */
  readonly words: readonly TypeWord[];
  readonly help: WordHelp;
}

const POOLS: Readonly<Record<WordPool, readonly TypeWordId[]>> = {
  short: SHORT_WORDS,
  mixed: [...SHORT_WORDS, ...LONG_WORDS],
  long: LONG_WORDS,
};

function stepFor(difficulty: number): Step {
  const step = STEPS[difficulty - 1];
  if (!Number.isInteger(difficulty) || step === undefined) {
    throw new RangeError(
      `Type the word has difficulty 1 to ${String(MAX_WORD_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return step;
}

/** The letters of a word. Every word in the lists is plain lower-case letters. */
export function lettersOf(word: string): Letter[] {
  const letters = Array.from(word);
  if (!letters.every(isLetter)) throw new RangeError(`"${word}" is not plain lower-case letters.`);
  return letters;
}

/** Pure: the same seed and difficulty give the same words. The band does not change them. */
export function generateLevel(seed: number, difficulty: number, _band: Band): TypeWordLevel {
  const step = stepFor(difficulty);
  const words = createRandom(seed).sample(POOLS[step.pool], step.count);
  return { words: words.map((id) => ({ id, letters: lettersOf(id) })), help: step.help };
}
