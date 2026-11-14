import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { lookAlike, type LetterCase } from '../../reading/alphabet.ts';
import { generateLevel, MAX_DIFFICULTY, type FindTheLetterLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 6_271 + 5);

function problems(level: FindTheLetterLevel): string[] {
  const found: string[] = [];
  if (level.choices.filter((letter) => letter === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a letter repeats');
  return found;
}

const lookingAlike = (level: FindTheLetterLevel) =>
  level.choices.filter((letter) => lookAlike(level.answer, letter, level.letterCase)).length;

describe('generateLevel', () => {
  // The number of letters to search and their case per difficulty are the design.
  it.each<[number, number, LetterCase]>([
    [1, 2, 'lower'],
    [2, 3, 'lower'],
    [3, 3, 'lower'],
    [4, 4, 'lower'],
    [5, 4, 'lower'],
    [6, 5, 'lower'],
    [7, 6, 'lower'],
    [8, 4, 'upper'],
    [9, 6, 'upper'],
  ])('at difficulty %i offers %i fair %s-case letters for every seed', (difficulty, count, letterCase) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.choices).toHaveLength(count);
      expect(level.letterCase).toBe(letterCase);
    }
  });

  it.each<[Band, number, string]>([
    ['band-3-5', 1, 'abekmostxz'],
    ['band-3-5', 5, 'abcdefghijklmnopqrstuvwxyz'],
    ['band-6-8', 3, 'abcdefghijklmnopqrstuvwxyz'],
    ['band-6-8', 9, 'abcdefghijklmnopqrstuvwxyz'],
  ])('in %s at difficulty %i asks for the letters %s', (band, difficulty, letters) => {
    const asked = new Set(SEEDS.map((seed) => generateLevel(seed, difficulty, band).answer));
    expect([...asked].toSorted().join('')).toBe(letters);
    for (const seed of SEEDS) {
      for (const letter of generateLevel(seed, difficulty, band).choices) expect(letters).toContain(letter);
    }
  });

  it('keeps look-alike letters such as b and d apart until difficulty 5', () => {
    for (const difficulty of [1, 2, 3, 4]) {
      for (const seed of SEEDS) expect(lookingAlike(generateLevel(seed, difficulty, 'band-3-5'))).toBe(0);
    }
  });

  it.each([
    [5, 1],
    [6, 2],
    [7, 3],
    [8, 1],
    [9, 2],
  ])(
    'at difficulty %i offers up to %i look-alike letters, and b always meets its mirror images',
    (difficulty, most) => {
      const counts = SEEDS.map((seed) => lookingAlike(generateLevel(seed, difficulty, 'band-6-8')));
      expect(Math.max(...counts)).toBe(most);
      const bRounds = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8')).filter(
        (level) => level.answer === 'b' && level.letterCase === 'lower',
      );
      for (const level of bRounds) expect(lookingAlike(level)).toBe(most);
    },
  );

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 7, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('repeats a round for the same seed', () => {
    expect(generateLevel(9, 6, 'band-6-8')).toEqual(generateLevel(9, 6, 'band-6-8'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 9, not/);
  });
});
