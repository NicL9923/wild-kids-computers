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
  });
});
