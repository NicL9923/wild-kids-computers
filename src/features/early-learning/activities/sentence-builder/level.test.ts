import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, MAX_DIFFICULTY, spareWords, type SentenceBuilderLevel } from './level.ts';
import { SENTENCES, wordsOf } from './sentences.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 1_301 + 43);

/** What makes a round solvable and fair. */
function problems(level: SentenceBuilderLevel): string[] {
  const found: string[] = [];
  const sentence = SENTENCES.find((each) => each.id === level.sentence);
  if (sentence === undefined) return ['no such sentence'];
  if (wordsOf(sentence).join(' ') !== level.words.join(' ')) found.push('the places do not spell the sentence');
  const tileWords = level.tiles.map((tile) => tile.word);
  for (const word of level.words) {
    if (tileWords.filter((each) => each === word).length !== 1) found.push(`not exactly one ${word} tile`);
  }
  const own = new Set(level.words.map((word) => word.toLowerCase()));
  for (const word of tileWords.filter((each) => !level.words.includes(each))) {
    if (own.has(word.toLowerCase())) found.push(`spare ${word} fits a place`);
  }
  const inOrder = tileWords.filter((word) => level.words.includes(word)).join(' ');
  if (inOrder === level.words.join(' ')) found.push('the tiles are already in order');
  if (new Set(level.tiles.map((tile) => tile.id)).size !== level.tiles.length) found.push('a tile id repeats');
  return found;
}

describe('generateLevel', () => {
  it.each([
    [1, 3, 3, 0],
    [2, 3, 4, 0],
    [3, 4, 4, 0],
    [4, 4, 5, 0],
    [5, 5, 5, 0],
    [6, 5, 6, 0],
    [7, 6, 6, 0],
    [8, 5, 6, 1],
    [9, 6, 6, 2],
  ])('at difficulty %i builds sentences of %i to %i words with %i spare tiles', (difficulty, fewest, most, spare) => {
    const lengths = new Set<number>();
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.tiles.length - level.words.length).toBe(spare);
      lengths.add(level.words.length);
    }
    expect(Math.min(...lengths)).toBe(fewest);
    expect(Math.max(...lengths)).toBe(most);
  });

  it.each<[Band, number, number]>([
    ['band-6-8', 1, 3],
    ['band-6-8', 6, 6],
    ['band-9-12', 5, 5],
    ['band-9-12', 9, 8],
  ])('in %s at difficulty %i shows at most %i tiles', (band, difficulty, most) => {
    expect(Math.max(...SEEDS.map((seed) => generateLevel(seed, difficulty, band).tiles.length))).toBe(most);
  });

  it('uses every sentence over many rounds', () => {
    const used = new Set<string>();
    for (let difficulty = 1; difficulty <= MAX_DIFFICULTY; difficulty += 1) {
      for (const seed of SEEDS) used.add(generateLevel(seed, difficulty, 'band-6-8').sentence);
    }
    expect(used.size).toBe(SENTENCES.length);
  });

  it('repeats a round for the same seed', () => {
    expect(generateLevel(8, 9, 'band-9-12')).toEqual(generateLevel(8, 9, 'band-9-12'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 3.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 9, not/);
  });
});

describe('spareWords', () => {
  it('leaves out every word of the sentence in any case, and the lone capital I', () => {
    const spares = spareWords(['The', 'sun', 'is', 'hot']);
    expect(spares).not.toContain('the');
    expect(spares).not.toContain('sun');
    expect(spares).not.toContain('i');
    expect(spares).toContain('dogs');
  });
});
