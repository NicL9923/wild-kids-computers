import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, MAX_TEN_DIFFICULTY, tierFor, type TenLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: the frame shows `filled` counters, and the answer fills it, offered once. */
function problems(level: TenLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  if (level.spaces.length !== level.whole) found.push(`${String(level.spaces.length)} spaces`);
  if (level.spaces.filter(Boolean).length !== level.filled) found.push('the counters do not match');
  if (level.filled < tier.min || level.filled > tier.max) found.push(`${String(level.filled)} outside the tier`);
  if (level.filled + level.answer !== level.whole) found.push('the answer does not make the whole');
  if (level.choices.filter((choice) => choice === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  if (level.choices.length !== tier.choices) found.push(`${String(level.choices.length)} choices`);
  if (level.choices.some((choice) => choice < 1 || choice > level.whole)) found.push('a choice is out of range');
  if (level.choices.some((choice, index) => index > 0 && choice < (level.choices[index - 1] ?? 0))) {
    found.push('the choices are not in order');
  }
  return found;
}

const inOrder = (level: TenLevel) => level.spaces.every((full, index) => full === index < level.filled);

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_TEN_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-6-8'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, number, number, number, boolean]>([
    ['band-3-5', 1, 5, 2, 4, false],
    ['band-3-5', 3, 10, 5, 9, false],
    ['band-6-8', 2, 5, 1, 4, false],
    ['band-6-8', 7, 10, 1, 9, true],
  ])(
    'in %s at difficulty %i makes %i from %i to %i counters, sentence %s',
    (band, difficulty, whole, min, max, sentence) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
      expect(Math.min(...levels.map((level) => level.filled))).toBe(min);
      expect(Math.max(...levels.map((level) => level.filled))).toBe(max);
      for (const level of levels) {
        expect(level.whole).toBe(whole);
        expect(level.sentence).toBe(sentence);
        expect(problems(level, difficulty)).toEqual([]);
      }
    },
  );

  // The design of each difficulty, read from the rounds it makes.
  it.each<[number, number, number, number, number, boolean]>([
    [1, 5, 2, 4, 3, false],
    [2, 5, 1, 4, 3, false],
    [3, 10, 5, 9, 3, false],
    [4, 10, 1, 9, 3, false],
    [5, 10, 1, 9, 4, false],
    [6, 10, 1, 9, 4, true],
    [7, 10, 1, 9, 4, true],
  ])(
    'difficulty %i makes %i from %i to %i counters with %i choices, sentence %s',
    (difficulty, whole, low, high, choices, sentence) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8'));
      expect(new Set(levels.map((level) => level.whole))).toEqual(new Set([whole]));
      expect([
        Math.min(...levels.map((level) => level.filled)),
        Math.max(...levels.map((level) => level.filled)),
      ]).toEqual([low, high]);
      expect(new Set(levels.map((level) => level.choices.length))).toEqual(new Set([choices]));
      expect(new Set(levels.map((level) => level.sentence))).toEqual(new Set([sentence]));
    },
  );

  it('fills the frame left to right until difficulty 5, then in any spaces', () => {
    for (const difficulty of [1, 2, 3, 4, 6]) {
      for (const seed of SEEDS.slice(0, 60)) expect(inOrder(generateLevel(seed, difficulty, 'band-6-8'))).toBe(true);
    }
    for (const difficulty of [5, 7]) {
      const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-6-8'));
      expect(levels.filter((level) => !inOrder(level)).length).toBeGreaterThan(SEEDS.length / 2);
    }
  });

  it('offers the number already in the frame as a choice, the mistake children make most', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 4, 'band-6-8')).filter((level) => level.filled !== 5);
    for (const level of levels) expect(level.choices).toContain(level.filled);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 5, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it.each([0, MAX_TEN_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 7, not/);
  });
});
