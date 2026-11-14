import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, MAX_TIMES_DIFFICULTY, mistakesFor, TIERS, tierFor, type TimesLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: a true product, offered once among choices that have clips. */
function problems(level: TimesLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  if (!tier.rows.includes(level.rows) || !tier.columns.includes(level.columns))
    found.push('a factor is outside the tier');
  if (level.answer !== level.rows * level.columns) found.push('the answer is not the product');
  if (level.show !== tier.show) found.push('shows the wrong thing');
  if (level.choices.length !== tier.choices) found.push(`${String(level.choices.length)} choices`);
  if (level.choices.filter((choice) => choice === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  if (level.choices.some((choice) => choice < 1 || choice > 100)) found.push('a choice has no clip');
  if (level.choices.some((choice, index) => index > 0 && choice < (level.choices[index - 1] ?? 0))) {
    found.push('the choices are not in order');
  }
  return found;
}

/** The different values, smallest first, as one string. */
const spread = (values: readonly number[]) => [...new Set(values)].toSorted((a, b) => a - b).join(' ');

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_TIMES_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-9-12'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, string, number, number]>([
    ['band-6-8', 1, 'array', 4, 15],
    ['band-6-8', 5, 'fact', 2, 100],
    ['band-9-12', 3, 'both', 4, 50],
    ['band-9-12', 9, 'fact', 36, 100],
  ])('in %s at difficulty %i shows the %s, products %i to %i', (band, difficulty, show, low, high) => {
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect(Math.min(...levels.map((level) => level.answer))).toBe(low);
    expect(Math.max(...levels.map((level) => level.answer))).toBe(high);
    for (const level of levels) {
      expect(level.show).toBe(show);
      expect(problems(level, difficulty)).toEqual([]);
    }
  });

  it('shows arrays first, then arrays with the fact, then the fact alone', () => {
    expect(TIERS.map((tier) => tier.show)).toEqual([
      'array',
      'array',
      'both',
      'both',
      'fact',
      'fact',
      'fact',
      'fact',
      'fact',
    ]);
  });

  // The design of each difficulty, read from the rounds it makes: the rows, the things in a
  // row, what shows, and the choices.
  it.each<[number, string, string, string, number]>([
    [1, '2 3', '2 3 4 5', 'array', 3],
    [2, '2 3 4 5', '2 3 4 5', 'array', 3],
    [3, '2 3 4 5', '2 5 10', 'both', 4],
    [4, '2 3 4 5 6', '2 3 4 5 6', 'both', 4],
    [5, '1 2 3 4 5 6 7 8 9 10', '2 5 10', 'fact', 4],
    [6, '2 3 4 5 6', '2 3 4 5 6', 'fact', 4],
    [7, '2 3 4 5 6 7 8 9', '2 3 4 5 6 7 8 9', 'fact', 4],
    [8, '2 3 4 5 6 7 8 9 10', '2 3 4 5 6 7 8 9 10', 'fact', 4],
    [9, '6 7 8 9 10', '6 7 8 9 10', 'fact', 4],
  ])('difficulty %i has rows %s of %s, shows the %s, with %i choices', (difficulty, rows, columns, show, choices) => {
    const levels = Array.from({ length: 1000 }, (_, index) => generateLevel(index * 7919 + 1, difficulty, 'band-9-12'));
    expect(spread(levels.map((level) => level.rows))).toBe(rows);
    expect(spread(levels.map((level) => level.columns))).toBe(columns);
    expect(new Set(levels.map((level) => level.show))).toEqual(new Set([show]));
    expect(new Set(levels.map((level) => level.choices.length))).toEqual(new Set([choices]));
  });

  it('fills ten times ten with numbers just under 100, never past it', () => {
    const tens = Array.from({ length: 3000 }, (_, index) => generateLevel(index * 7919 + 1, 9, 'band-9-12')).filter(
      (level) => level.answer === 100,
    );
    expect(tens.length).toBeGreaterThan(10);
    const offered = new Set(tens.flatMap((level) => level.choices));
    expect([...offered].toSorted((a, b) => a - b)).toEqual([20, 90, 98, 99, 100]);
  });

  it('offers a neighboring fact as a choice in most rounds', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 7, 'band-9-12'));
    const neighbor = levels.filter((level) =>
      level.choices.some(
        (choice) => choice === (level.rows + 1) * level.columns || choice === level.rows * (level.columns - 1),
      ),
    );
    expect(neighbor.length).toBeGreaterThan(SEEDS.length / 2);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 6, 'band-9-12');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it.each([0, MAX_TIMES_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 9, not/);
  });
});

describe('mistakesFor', () => {
  it('lists neighboring facts and the sum, leaving out zero and numbers past 100', () => {
    expect(mistakesFor(3, 4)).toEqual([8, 16, 9, 15, 7, 20]);
    expect(mistakesFor(1, 10)).toEqual([20, 9, 11, 11, 30]);
    expect(mistakesFor(10, 10)).toEqual([90, 90, 20]);
    expect(mistakesFor(9, 10)).toEqual([80, 100, 81, 99, 19]);
    expect(mistakesFor(1, 2)).toEqual([4, 1, 3, 3, 6]);
  });
});
