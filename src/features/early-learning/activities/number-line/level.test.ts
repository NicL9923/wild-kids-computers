import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, isLabeled, MAX_LINE_DIFFICULTY, TIERS, tierFor, type LineLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: equal steps up to 100, a target that is hidden and in the middle, one answer. */
function problems(level: LineLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  const first = level.marks[0]?.value ?? -1;
  if (level.marks.length !== tier.marks) found.push(`${String(level.marks.length)} marks`);
  if (first < 0 || first > tier.startMax || first % tier.step !== 0) found.push(`starts at ${String(first)}`);
  level.marks.forEach((mark, index) => {
    if (mark.index !== index || mark.value !== first + index * tier.step) found.push(`mark ${String(index)} is off`);
  });
  if ((level.marks.at(-1)?.value ?? 101) > 100) found.push('the line passes 100');
  const target = level.marks[level.target];
  if (target === undefined || level.target === 0 || level.target === level.marks.length - 1)
    found.push('the target is an end');
  if (target?.labeled !== false) found.push('the target shows its number');
  if (target?.value !== level.answer) found.push('the answer is not the target');
  if (level.mode !== tier.mode) found.push(`mode ${level.mode}`);
  if (level.mode === 'missing') {
    if (level.marks.filter((mark) => !mark.labeled).length !== 1) found.push('more than one label is missing');
    if (level.choices.length !== tier.choices) found.push(`${String(level.choices.length)} choices`);
    if (level.choices.filter((choice) => choice === level.answer).length !== 1)
      found.push('the answer is not offered once');
    if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
    if (level.choices.some((choice) => choice < 0)) found.push('a choice is below 0');
  } else {
    if (level.choices.length !== 0) found.push('a place round offers numbers');
    // Two labeled marks, at least, so the child can work out the steps.
    if (level.marks.filter((mark) => mark.labeled).length < 2) found.push('too few labels to reason from');
  }
  return found;
}

const labeled = (difficulty: number) =>
  generateLevel(7, difficulty, 'band-9-12').marks.filter((mark) => mark.labeled).length;

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_LINE_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-9-12'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, string, number, number, number]>([
    ['band-6-8', 1, 'missing', 1, 0, 5],
    ['band-6-8', 6, 'missing', 2, 0, 40],
    ['band-9-12', 4, 'place', 1, 0, 10],
    ['band-9-12', 9, 'place', 5, 0, 100],
  ])('in %s at difficulty %i asks %s, counting by %i, from %i up to %i', (band, difficulty, mode, step, low, high) => {
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect(Math.min(...levels.map((level) => level.marks[0]?.value ?? -1))).toBe(low);
    expect(Math.max(...levels.map((level) => level.marks.at(-1)?.value ?? -1))).toBe(high);
    for (const level of levels) {
      expect(level.mode).toBe(mode);
      expect(level.step).toBe(step);
      expect(problems(level, difficulty)).toEqual([]);
    }
  });

  it('labels fewer marks as the levels rise: all, then the ends and the middle, then only the ends', () => {
    expect(labeled(2)).toBe(10);
    expect(labeled(4)).toBe(3);
    expect(labeled(8)).toBe(2);
  });

  it('hides every middle mark as the target over many rounds', () => {
    const targets = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-6-8').target));
    expect([...targets].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('never asks to place the middle mark while it shows its number', () => {
    const targets = new Set(SEEDS.map((seed) => generateLevel(seed, 4, 'band-9-12').target));
    expect(targets.has(5)).toBe(false);
    expect(targets.size).toBe(8);
  });

  it('offers one-off mistakes when counting by more than one', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 7, 'band-9-12'));
    expect(
      levels.some((level) => level.choices.includes(level.answer + 1) || level.choices.includes(level.answer - 1)),
    ).toBe(true);
  });

  it('puts the answer in every position over many rounds', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 3, 'band-6-8');
        return level.choices.indexOf(level.answer);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('counts by one, then two, five, and ten', () => {
    expect(TIERS.map((tier) => tier.step)).toEqual([1, 1, 1, 1, 1, 2, 5, 10, 5]);
  });

  it.each([0, MAX_LINE_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 9, not/);
  });
});

describe('isLabeled', () => {
  it.each([
    ['all', 4, 11, true],
    ['ends', 0, 11, true],
    ['ends', 10, 11, true],
    ['ends', 5, 11, false],
    ['ends-middle', 5, 11, true],
    ['ends-middle', 4, 11, false],
    ['ends-middle', 6, 11, false],
  ] as const)('with %s labels, mark %i of %i shows its number: %s', (labels, index, count, shown) => {
    expect(isLabeled(labels, index, count)).toBe(shown);
  });
});
