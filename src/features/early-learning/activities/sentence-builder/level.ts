import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { SENTENCES, wordsOf, type Sentence, type SentenceId } from './sentences.ts';

/**
 * Sentence builder: the child hears a sentence and puts its word tiles in order. Difficulty
 * lengthens the sentence from three words to six, then adds spare words from other sentences
 * that belong nowhere.
 */

interface Tier {
  /** The fewest and most words. */
  readonly words: readonly [number, number];
  readonly spare: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { words: [3, 3], spare: 0 },
  { words: [3, 4], spare: 0 },
  { words: [4, 4], spare: 0 },
  { words: [4, 5], spare: 0 },
  { words: [5, 5], spare: 0 },
  { words: [5, 6], spare: 0 },
  { words: [6, 6], spare: 0 },
  { words: [5, 6], spare: 1 },
  { words: [6, 6], spare: 2 },
];

export const MAX_DIFFICULTY = TIERS.length;

type TileId = `word-${number}`;

export interface WordTile {
  readonly id: TileId;
  readonly word: string;
}

export interface SentenceBuilderLevel {
  readonly sentence: SentenceId;
  readonly picture: Sentence['picture'];
  /** The words in order: place n takes words[n]. */
  readonly words: readonly string[];
  /** The tiles in screen order: one per word, and the spares. */
  readonly tiles: readonly WordTile[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Sentence builder has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/**
 * Words from other sentences that can be spare tiles: none that is in this sentence in any case,
 * so a spare never fits a place.
 */
export function spareWords(words: readonly string[]): string[] {
  const own = new Set(words.map((word) => word.toLowerCase()));
  const all = SENTENCES.flatMap((sentence) => wordsOf(sentence).map((word) => word.toLowerCase()));
  return [...new Set(all)].filter((word) => !own.has(word) && word !== 'i');
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SentenceBuilderLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const [fewest, most] = tier.words;
  const sentence = random.pick(
    SENTENCES.filter((each) => {
      const count = wordsOf(each).length;
      return count >= fewest && count <= most;
    }),
  );
  const words = wordsOf(sentence);
  let order = random.shuffle([...words, ...random.sample(spareWords(words), tier.spare)]);
  // Tiles already in sentence order leave nothing to build: swap the sentence's first two words.
  const ofSentence = order.flatMap((word, index) => (words.includes(word) ? [index] : []));
  const [first, second] = ofSentence;
  const [firstWord, secondWord] = words;
  const inOrder = ofSentence.map((index) => order[index]).join(' ') === words.join(' ');
  if (inOrder && first !== undefined && second !== undefined && firstWord && secondWord) {
    order = order.with(first, secondWord).with(second, firstWord);
  }
  return {
    sentence: sentence.id,
    picture: sentence.picture,
    words,
    tiles: order.map((word, index): WordTile => ({ id: `word-${index}`, word })),
  };
}
