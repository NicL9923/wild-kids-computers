import { describe, expect, it } from 'vitest';
import activity from './activity.ts';
import { ALL_LETTERS, FIRST_LETTERS, generateLevel, MAX_KEY_DIFFICULTY, STEPS } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 11);
const DIFFICULTIES = Array.from({ length: MAX_KEY_DIFFICULTY }, (_, index) => index + 1);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives distinct real letters from the right pool', (difficulty) => {
    const step = STEPS[difficulty - 1];
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(level.letters).toHaveLength(step?.count ?? -1);
      expect(new Set(level.letters).size).toBe(level.letters.length);
      const pool = step?.pool === 'first' ? FIRST_LETTERS : ALL_LETTERS;
      for (const letter of level.letters) expect(pool).toContain(letter);
      expect(level.help).toBe(step?.help);
    }
  });

  it('adds letters and takes away help one small step at a time', () => {
    expect(STEPS.map((step) => `${String(step.count)} ${step.pool} ${step.help}`)).toEqual([
      '1 first key',
      '2 first key',
      '2 all key',
      '3 all key',
      '3 all row',
      '4 all row',
      '4 all none',
      '5 all none',
    ]);
  });

  it('always lights the key for the youngest band', () => {
    const range = activity.kind === 'rounds' ? activity.difficulty['band-3-5'] : undefined;
    for (let difficulty = range?.min ?? 1; difficulty <= (range?.max ?? 0); difficulty += 1) {
      expect(generateLevel(7, difficulty, 'band-3-5').help).toBe('key');
    }
  });

  it('gives the first letters no pair that mirrors on a key cap', () => {
    // b and d, p and q, n and u, m and w look alike turned over. Only one of each pair is first.
    const pairs = [
      ['b', 'd'],
      ['p', 'q'],
      ['n', 'u'],
      ['m', 'w'],
    ] as const;
    for (const pair of pairs) {
      expect(pair.filter((letter) => FIRST_LETTERS.includes(letter)).length).toBeLessThanOrEqual(1);
    }
  });

  it('reaches every letter of the alphabet across seeds at the top of the range', () => {
    const seen = new Set(SEEDS.flatMap((seed) => generateLevel(seed, MAX_KEY_DIFFICULTY, 'band-6-8').letters));
    expect(seen.size).toBe(26);
  });

  it.each([0, MAX_KEY_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});
