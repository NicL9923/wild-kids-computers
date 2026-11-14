import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { sameSound, similarSound, VOWELS } from '../../reading/alphabet.ts';
import { firstLetter, generateLevel, MAX_DIFFICULTY, type FirstSoundLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 5_381 + 17);

function problems(level: FirstSoundLevel): string[] {
  const found: string[] = [];
  if (firstLetter(level.word) !== level.answer) found.push(`${level.word} does not start with ${level.answer}`);
  if (level.choices.filter((letter) => letter === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a letter repeats');
  for (const [index, letter] of level.choices.entries()) {
    for (const other of level.choices.slice(index + 1)) {
      if (sameSound(letter, other)) found.push(`${letter} and ${other} both say the first sound`);
    }
  }
  return found;
}

const closeSounds = (level: FirstSoundLevel) =>
  level.choices.filter((letter) => similarSound(level.answer, letter)).length;

describe('generateLevel', () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 5],
    [7, 6],
  ])('at difficulty %i offers %i letters, one of them right, for every seed', (difficulty, count) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.choices).toHaveLength(count);
    }
  });

  it.each<[Band, number, boolean]>([
    ['band-3-5', 1, false],
    ['band-3-5', 5, true],
    ['band-6-8', 3, true],
    ['band-6-8', 7, true],
  ])('in %s at difficulty %i asks for vowel-start words: %s', (band, difficulty, vowels) => {
    const answers = SEEDS.map((seed) => generateLevel(seed, difficulty, band).answer);
    expect(answers.some((letter) => VOWELS.includes(letter))).toBe(vowels);
  });

  it('keeps close sounds such as d and t apart at the easy end', () => {
    for (const difficulty of [1, 2, 3, 4]) {
      for (const seed of SEEDS) expect(closeSounds(generateLevel(seed, difficulty, 'band-3-5'))).toBe(0);
    }
  });

  it.each([
    [5, 1],
    [7, 1],
  ])('at difficulty %i offers up to %i letters with a close sound', (difficulty, most) => {
    const counts = SEEDS.map((seed) => closeSounds(generateLevel(seed, difficulty, 'band-6-8')));
    expect(Math.max(...counts)).toBe(most);
    // A b word always meets p, the one letter that sounds like b.
    const bRounds = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8')).filter(
      (level) => level.answer === 'b',
    );
    expect(bRounds.length).toBeGreaterThan(0);
    for (const level of bRounds) expect(level.choices).toContain('p');
  });

  it('asks every first letter about as often, not just the letters with many pictures', () => {
    const counts = new Map<string, number>();
    for (const seed of SEEDS) {
      const { answer } = generateLevel(seed, 1, 'band-3-5');
      counts.set(answer, (counts.get(answer) ?? 0) + 1);
    }
    // 19 consonants over 300 rounds is about 16 each.
    expect(counts.size).toBe(19);
    expect(Math.max(...counts.values())).toBeLessThan(32);
  });

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
    expect(generateLevel(31, 4, 'band-3-5')).toEqual(generateLevel(31, 4, 'band-3-5'));
  });

  it.each([0, MAX_DIFFICULTY + 1, 0.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 7, not/);
  });
});
