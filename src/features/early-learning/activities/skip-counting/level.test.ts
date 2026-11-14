import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { generateLevel, MAX_SKIP_DIFFICULTY, startsFor, tierFor, type SkipLevel } from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: an even count up to 100, one blank, its number offered once. */
function problems(level: SkipLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  if (!tier.steps.includes(level.step)) found.push(`counts by ${String(level.step)}`);
  if (level.numbers.length !== tier.length) found.push(`${String(level.numbers.length)} numbers`);
  level.numbers.forEach((value, index) => {
    if (index > 0 && value - (level.numbers[index - 1] ?? 0) !== level.step) found.push(`uneven at ${String(index)}`);
  });
  const first = level.numbers[0] ?? -1;
  const startsRight =
    tier.start === 'zero' ? first === 0 : first > 0 && (first % level.step === 0) === (tier.start === 'multiple');
  if (!startsRight) found.push(`starts at ${String(first)}`);
  if ((level.numbers.at(-1) ?? 101) > 100) found.push('the count passes 100');
  if (level.blank < 1 || level.blank >= level.numbers.length) found.push('the blank is first or outside');
  if (tier.blank === 'end' && level.blank !== level.numbers.length - 1) found.push('the blank is not last');
  if (level.numbers[level.blank] !== level.answer) found.push('the answer is not the blank');
  if (level.choices.length !== tier.choices) found.push(`${String(level.choices.length)} choices`);
  if (level.choices.filter((choice) => choice === level.answer).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  if (level.choices.some((choice) => choice < 0 || choice > 100)) found.push('a choice has no clip');
  if (level.hops !== tier.hops) found.push('hops');
  return found;
}

/** Where a count starts: at zero, at a multiple of its step, or off the multiples. */
function startOf(level: SkipLevel): string {
  const first = level.numbers[0] ?? -1;
  if (first === 0) return 'zero';
  return first % level.step === 0 ? 'multiple' : 'offset';
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_SKIP_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-9-12'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, readonly number[], boolean]>([
    ['band-6-8', 1, [10], true],
    ['band-6-8', 5, [2, 5, 10], false],
    ['band-9-12', 4, [2, 5, 10], true],
    ['band-9-12', 8, [2, 5, 10], false],
  ])('in %s at difficulty %i counts by %j, hops shown %s', (band, difficulty, steps, hops) => {
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect([...new Set(levels.map((level) => level.step))].toSorted((a, b) => a - b)).toEqual(steps);
    for (const level of levels) {
      expect(level.hops).toBe(hops);
      expect(problems(level, difficulty)).toEqual([]);
    }
  });

  // The design of each difficulty, read from the rounds it makes: the steps, where counts start,
  // how many numbers show, where the blank goes, the choices, and the hops.
  it.each<[number, string, string, number, string, number, boolean]>([
    [1, '10', 'zero', 5, 'end', 3, true],
    [2, '5', 'zero', 5, 'end', 3, true],
    [3, '2', 'zero', 5, 'end', 3, true],
    [4, '2 5 10', 'multiple', 6, 'end', 3, true],
    [5, '2 5 10', 'multiple', 6, 'inside', 4, false],
    [6, '10', 'offset', 6, 'end', 4, false],
    [7, '2 5', 'offset', 6, 'end', 4, false],
    [8, '2 5 10', 'offset', 7, 'inside', 4, false],
  ])(
    'difficulty %i counts by %s from %s, shows %i, blank at the %s, %i choices, hops %s',
    (difficulty, steps, start, length, blank, choices, hops) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, 'band-9-12'));
      expect([...new Set(levels.map((level) => level.step))].toSorted((a, b) => a - b).join(' ')).toBe(steps);
      expect(new Set(levels.map(startOf))).toEqual(new Set([start]));
      expect(new Set(levels.map((level) => level.numbers.length))).toEqual(new Set([length]));
      const atEnd = levels.every((level) => level.blank === level.numbers.length - 1);
      expect(atEnd ? 'end' : 'inside').toBe(blank);
      expect(new Set(levels.map((level) => level.choices.length))).toEqual(new Set([choices]));
      expect(new Set(levels.map((level) => level.hops))).toEqual(new Set([hops]));
    },
  );

  it('offers each kind of mistake: one off, and a step or two away, both ways', () => {
    const offsets = new Set(
      SEEDS.flatMap((seed) => {
        const level = generateLevel(seed, 6, 'band-9-12');
        return level.choices.map((choice) => choice - level.answer);
      }),
    );
    expect([...offsets].toSorted((a, b) => a - b)).toEqual([-20, -10, -1, 0, 1, 10, 20]);
  });

  it('offers 0 when the blank is two steps past it', () => {
    const levels = Array.from({ length: 3000 }, (_, index) => generateLevel(index * 7919 + 1, 5, 'band-9-12'));
    expect(levels.some((level) => level.choices.includes(0))).toBe(true);
  });

  it('offers 100 when it is near the answer, and nothing past it', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 4, 'band-9-12'));
    expect(levels.some((level) => level.choices.includes(100) && level.answer !== 100)).toBe(true);
  });

  it('starts with tens from zero, the easiest count', () => {
    expect(generateLevel(3, 1, 'band-6-8').numbers).toEqual([0, 10, 20, 30, 40]);
  });

  it('puts the blank anywhere but first once it moves inside', () => {
    const blanks = new Set(SEEDS.map((seed) => generateLevel(seed, 8, 'band-9-12').blank));
    expect([...blanks].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
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

  it.each([0, MAX_SKIP_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('startsFor', () => {
  it('starts at zero, at a multiple, or off the multiples, and leaves room to reach 100', () => {
    expect(startsFor('zero', 5, 6)).toEqual([0]);
    expect(startsFor('multiple', 10, 6)).toEqual([10, 20, 30, 40, 50]);
    expect(startsFor('offset', 10, 6).slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    expect(startsFor('offset', 10, 6).at(-1)).toBe(49);
    expect(startsFor('multiple', 2, 7).at(-1)).toBe(88);
  });
});
