import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, MAX_ADD_DIFFICULTY, problemsFor, THINGS, TIERS, tierFor, type AddLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: a true answer offered once, numbers in the tier, nothing negative. */
function problems(level: AddLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  const whole = level.operation === 'add' ? level.first + level.second : level.first;
  const truth = level.operation === 'add' ? level.first + level.second : level.first - level.second;
  if (level.answer !== truth) found.push('the answer is not true');
  if (whole < tier.min || whole > tier.max) found.push(`whole ${String(whole)} outside the tier`);
  if (level.first < 1 || level.second < 1) found.push('a part is empty');
  if (level.answer < (tier.zero ? 0 : 1)) found.push('the answer is too small');
  if (!tier.operations.includes(level.operation)) found.push(`${level.operation} in this tier`);
  if (level.show !== tier.show) found.push('shows the wrong thing');
  if (level.choices.length !== tier.choices) found.push(`${String(level.choices.length)} choices`);
  if (level.choices.filter((choice) => choice === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  if (level.choices.some((choice) => choice < 0 || Math.abs(choice - level.answer) > 4))
    found.push('a choice is far off');
  if (level.choices.some((choice, index) => index > 0 && choice < (level.choices[index - 1] ?? 0))) {
    found.push('the choices are not in order');
  }
  return found;
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_ADD_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-6-8'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, readonly string[], string, number]>([
    ['band-3-5', 1, ['add'], 'things', 3],
    ['band-3-5', 4, ['add', 'subtract'], 'things', 6],
    ['band-6-8', 3, ['add', 'subtract'], 'things', 5],
    ['band-6-8', 10, ['add', 'subtract'], 'sentence', 20],
  ])('in %s at difficulty %i does %j, shows %s, up to %i', (band, difficulty, operations, show, largest) => {
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect([...new Set(levels.map((level) => level.operation))].toSorted()).toEqual(operations);
    expect(Math.max(...levels.map((level) => (level.operation === 'add' ? level.answer : level.first)))).toBe(largest);
    for (const level of levels) {
      expect(level.show).toBe(show);
      expect(problems(level, difficulty)).toEqual([]);
    }
  });

  it('never takes everything away until difficulty 7, then sometimes does', () => {
    for (let difficulty = 1; difficulty <= 6; difficulty += 1) {
      for (const seed of SEEDS) expect(generateLevel(seed, difficulty, 'band-6-8').answer).toBeGreaterThan(0);
    }
    expect(SEEDS.some((seed) => generateLevel(seed, 7, 'band-6-8').answer === 0)).toBe(true);
  });

  it('shows things alone, then things with the sentence, then the sentence alone', () => {
    expect(TIERS.map((tier) => tier.show)).toEqual([
      'things',
      'things',
      'things',
      'things',
      'things',
      'both',
      'both',
      'both',
      'sentence',
      'sentence',
    ]);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 8, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('uses every kind of thing across rounds', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-3-5').kind));
    expect([...kinds].toSorted()).toEqual([...THINGS].toSorted());
  });

  it.each([0, MAX_ADD_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('problemsFor', () => {
  const tier = { operations: ['add', 'subtract'], min: 2, max: 3, show: 'things', choices: 3, zero: false } as const;

  it('lists every way to make each whole from two groups of at least one', () => {
    expect(problemsFor(tier, 'add')).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('takes away at least one and leaves at least one, unless the tier allows nothing left', () => {
    expect(problemsFor(tier, 'subtract')).toEqual([
      [2, 1],
      [3, 1],
      [3, 2],
    ]);
    expect(problemsFor({ ...tier, zero: true }, 'subtract')).toEqual([
      [2, 1],
      [2, 2],
      [3, 1],
      [3, 2],
      [3, 3],
    ]);
  });
});
