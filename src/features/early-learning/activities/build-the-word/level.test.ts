import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { lookAlike, sameSound, similarSound, type Letter } from '../../reading/alphabet.ts';
import { generateLevel, lettersOfWord, MAX_DIFFICULTY, spareLetters, type BuildTheWordLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 2_861 + 31);

const counts = (letters: readonly Letter[]) => {
  const map = new Map<Letter, number>();
  for (const letter of letters) map.set(letter, (map.get(letter) ?? 0) + 1);
  return map;
};

/** What makes a round solvable and fair. */
function problems(level: BuildTheWordLevel): string[] {
  const found: string[] = [];
  if (lettersOfWord(level.word).join('') !== level.letters.join('')) found.push('the boxes do not spell the word');
  const tileLetters = level.tiles.map((tile) => tile.letter);
  // Every letter of the word has its own tile, so the word can be built.
  for (const [letter, needed] of counts(level.letters)) {
    if ((counts(tileLetters).get(letter) ?? 0) !== needed) found.push(`not exactly ${String(needed)} ${letter} tiles`);
  }
  // A spare tile fits no box and sounds like no letter of the word.
  for (const letter of tileLetters.filter((each) => !level.letters.includes(each))) {
    if (level.letters.some((own) => sameSound(own, letter))) found.push(`spare ${letter} says a sound of the word`);
  }
  if (new Set(level.tiles.map((tile) => tile.id)).size !== level.tiles.length) found.push('a tile id repeats');
  const inOrder = tileLetters.filter((letter) => level.letters.includes(letter)).join('');
  if (inOrder === level.letters.join('')) found.push('the tiles already spell the word');
  return found;
}

const spares = (level: BuildTheWordLevel) => level.tiles.length - level.letters.length;

describe('generateLevel', () => {
  it.each([
    [1, 3, 3, true, 0],
    [2, 3, 3, true, 1],
    [3, 3, 3, false, 0],
    [4, 3, 3, false, 1],
    [5, 4, 4, false, 1],
    [6, 4, 4, false, 2],
    [7, 4, 5, false, 2],
    [8, 4, 6, false, 3],
  ])(
    'at difficulty %i builds words of %i to %i letters, guide %s, with %i spare tiles',
    (difficulty, shortest, longest, guide, spare) => {
      const lengths = new Set<number>();
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.guide).toBe(guide);
        expect(spares(level)).toBe(spare);
        lengths.add(level.letters.length);
      }
      expect(Math.min(...lengths)).toBe(shortest);
      expect(Math.max(...lengths)).toBe(longest);
    },
  );

  it.each<[Band, number, number]>([
    ['band-3-5', 1, 3],
    ['band-3-5', 4, 4],
    ['band-6-8', 3, 3],
    ['band-6-8', 8, 9],
  ])('in %s at difficulty %i shows at most %i tiles', (band, difficulty, most) => {
    expect(Math.max(...SEEDS.map((seed) => generateLevel(seed, difficulty, band).tiles.length))).toBe(most);
  });

  it('from difficulty 6 makes all but one spare tile look or sound like a letter of the word when it can', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 6, 'band-6-8');
      const spareTiles = level.tiles.filter((tile) => !level.letters.includes(tile.letter));
      const near = spareTiles.filter((tile) =>
        level.letters.some((own) => lookAlike(own, tile.letter) || similarSound(own, tile.letter)),
      );
      expect(near.length, `seed ${String(seed)}`).toBe(Math.min(1, spareLetters(level.letters, true).near.length));
    }
  });

  it('keeps spare tiles unlike the word before difficulty 6', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 5, 'band-6-8');
      for (const tile of level.tiles.filter((each) => !level.letters.includes(each.letter))) {
        expect(level.letters.some((own) => lookAlike(own, tile.letter) || similarSound(own, tile.letter))).toBe(false);
      }
    }
  });

  it('repeats a round for the same seed', () => {
    expect(generateLevel(3, 7, 'band-6-8')).toEqual(generateLevel(3, 7, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('spareLetters', () => {
  it('never offers a letter that says a sound of the word, such as k for cat', () => {
    const { near, far } = spareLetters(['c', 'a', 't'], true);
    expect([...near, ...far]).not.toContain('k');
    expect([...near, ...far]).not.toContain('q');
    expect([...near, ...far]).not.toContain('c');
  });

  it('puts look-alike and sound-alike letters first only when asked', () => {
    expect(spareLetters(['b', 'e', 'd'], true).near).toEqual(expect.arrayContaining(['p', 'q', 'i', 't']));
    expect(spareLetters(['b', 'e', 'd'], false).near).toEqual([]);
    expect(spareLetters(['b', 'e', 'd'], false).far).not.toContain('p');
  });
});
