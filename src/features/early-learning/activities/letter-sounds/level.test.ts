import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { isLetter, sameSound, similarSound, type Letter } from '../../reading/alphabet.ts';
import { generateLevel, MAX_DIFFICULTY, type LetterSoundsLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7_919 + 11);

/** What makes a round fair: one right letter, and no two letters that say the same sound. */
function problems(level: LetterSoundsLevel): string[] {
  const found: string[] = [];
  if (level.choices.filter((letter) => letter === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a letter repeats');
  for (const [index, letter] of level.choices.entries()) {
    for (const other of level.choices.slice(index + 1)) {
      if (sameSound(letter, other)) found.push(`${letter} and ${other} say the same sound`);
    }
  }
  return found;
}

// How many letters with a close sound one round could offer: c, k, and q count once.
const closeTo = (answer: Letter, pool: string) => {
  const kept: Letter[] = [];
  for (const letter of pool.split('').filter(isLetter)) {
    if (similarSound(answer, letter) && !sameSound(answer, letter) && kept.every((k) => !sameSound(k, letter))) {
      kept.push(letter);
    }
  }
  return kept.length;
};

const together = (letters: readonly Letter[]) => letters.filter((letter) => 'ckq'.includes(letter)).length;

const similarTo = (level: LetterSoundsLevel) =>
  level.choices.filter((letter) => similarSound(level.answer, letter)).length;

describe('generateLevel', () => {
  // The choice count per difficulty is the design: it is how hard a round looks to the child.
  it.each([
    [1, 2],
    [2, 3],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 4],
    [7, 5],
    [8, 5],
  ])('at difficulty %i offers %i fair letters for every seed', (difficulty, count) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.choices).toHaveLength(count);
    }
  });

  // The edges of each band's range in activity.ts: which letters can be asked.
  it.each<[Band, number, string]>([
    ['band-3-5', 1, 'aimnpst'],
    ['band-3-5', 5, 'abcdefghiklmnoprstu'],
    ['band-6-8', 3, 'abcdefghiklmnoprstu'],
    ['band-6-8', 8, 'abcdefghijklmnopqrstuvwxyz'],
  ])('in %s at difficulty %i asks for the letters %s', (band, difficulty, letters) => {
    const asked = new Set(SEEDS.map((seed) => generateLevel(seed, difficulty, band).answer));
    expect([...asked].toSorted().join('')).toBe(letters);
    for (const seed of SEEDS) {
      for (const letter of generateLevel(seed, difficulty, band).choices) expect(letters).toContain(letter);
    }
  });

  it('keeps letters with close sounds apart at the easy end', () => {
    for (const difficulty of [1, 2, 3, 4]) {
      for (const seed of SEEDS) expect(similarTo(generateLevel(seed, difficulty, 'band-3-5'))).toBe(0);
    }
  });

  it.each([
    [5, 'abcdefghiklmnoprstu', 1],
    [6, 'abcdefghijklmnoprstuvwyz', 1],
    [7, 'abcdefghijklmnoprstuvwyz', 1],
    [8, 'abcdefghijklmnopqrstuvwxyz', 2],
  ])('at difficulty %i offers letters with a close sound when it can', (difficulty, pool, wanted) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(similarTo(level), `seed ${String(seed)}`).toBe(Math.min(wanted, closeTo(level.answer, pool)));
    }
  });

  it('never offers c, k, and q together, because they share the sound "kuh"', () => {
    for (let difficulty = 1; difficulty <= MAX_DIFFICULTY; difficulty += 1) {
      for (const seed of SEEDS) expect(together(generateLevel(seed, difficulty, 'band-6-8').choices)).toBeLessThan(2);
    }
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 7, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(9, 5, 'band-3-5')).toEqual(generateLevel(9, 5, 'band-3-5'));
    expect(SEEDS.slice(0, 5).map((seed) => generateLevel(seed, 5, 'band-3-5').answer)).not.toEqual(
      Array.from({ length: 5 }, () => generateLevel(SEEDS[0] ?? 0, 5, 'band-3-5').answer),
    );
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});
