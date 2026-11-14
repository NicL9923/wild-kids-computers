import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import activity from './activity.ts';
import {
  generateLevel,
  groupsFor,
  MAX_MATCH_DIFFICULTY,
  THINGS,
  TIERS,
  tierFor,
  wrongCounts,
  type MatchLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: one group with the number, the others near it but never equal. */
function problems(level: MatchLevel, difficulty: number, band: Band = 'band-6-8'): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  const matching = level.groups.filter((group) => group.count === level.target);
  if (matching.length !== 1) found.push(`${String(matching.length)} groups have ${String(level.target)}`);
  if (matching[0]?.id !== level.answer) found.push('the answer is not the matching group');
  if (new Set(level.groups.map((group) => group.id)).size !== level.groups.length) found.push('group ids repeat');
  if (level.groups.length !== groupsFor(tier, band)) found.push(`${String(level.groups.length)} groups`);
  for (const group of level.groups) {
    if (group.count < 1) found.push(`${group.id} is empty`);
    if (group.count === level.target) continue;
    const distance = Math.abs(group.count - level.target);
    if (distance < tier.gap) found.push(`${group.id} is too close`);
    if (distance > 3) found.push(`${group.id} is too far`);
  }
  if (level.target < tier.min || level.target > tier.max) found.push(`target ${String(level.target)} outside the tier`);
  return found;
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_MATCH_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-6-8'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts, with the numbers a child is asked to find.
  it.each<[Band, number, number, number, number]>([
    ['band-3-5', 1, 1, 3, 2],
    ['band-3-5', 5, 3, 8, 2],
    ['band-6-8', 3, 1, 5, 3],
    ['band-6-8', 8, 6, 15, 3],
  ])('in %s at difficulty %i asks for %i to %i with %i groups', (band, difficulty, min, max, groups) => {
    if (activity.kind !== 'rounds') throw new Error('rounds');
    const range = activity.difficulty[band];
    expect([range?.min, range?.max]).toContain(difficulty);
    const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
    expect(Math.min(...levels.map((level) => level.target))).toBe(min);
    expect(Math.max(...levels.map((level) => level.target))).toBe(max);
    for (const level of levels) {
      expect(level.groups).toHaveLength(groups);
      expect(problems(level, difficulty, band)).toEqual([]);
    }
  });

  it('starts with groups that differ by at least two, so a three-year-old can see the difference', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 1, 'band-3-5');
      const other = level.groups.find((group) => group.id !== level.answer);
      expect(Math.abs((other?.count ?? 0) - level.target)).toBeGreaterThanOrEqual(2);
    }
  });

  it.each<[Band, string[]]>([
    ['band-3-5', ['group-0', 'group-1']],
    ['band-6-8', ['group-0', 'group-1', 'group-2']],
  ])('in %s puts the right group in every place over many rounds', (band, expected) => {
    const places = new Set(SEEDS.map((seed) => generateLevel(seed, 3, band).answer));
    expect([...places].toSorted()).toEqual(expected);
  });

  it('sometimes offers a group with one fewer and one more than the target', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 6, 'band-6-8'));
    const counts = levels.flatMap((level) => level.groups.map((group) => group.count - level.target));
    expect(counts).toContain(-1);
    expect(counts).toContain(1);
  });

  it('uses every kind of thing across rounds', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-3-5').kind));
    expect([...kinds].toSorted()).toEqual([...THINGS].toSorted());
  });

  it('grows by small steps: each level up raises the largest number by at most three', () => {
    for (let index = 1; index < TIERS.length; index += 1) {
      const step = (TIERS[index]?.max ?? 0) - (TIERS[index - 1]?.max ?? 0);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(3);
    }
  });

  it.each([0, MAX_MATCH_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('wrongCounts', () => {
  it('keeps the gap, stays at 1 or more, and stops two past the largest number', () => {
    expect(wrongCounts(1, { min: 1, max: 3, groups: 2, gap: 2 })).toEqual([3, 4]);
    expect(wrongCounts(3, { min: 1, max: 3, groups: 2, gap: 2 })).toEqual([1, 5]);
    expect(wrongCounts(15, { min: 6, max: 15, groups: 4, gap: 1 })).toEqual([12, 13, 14, 16, 17]);
  });
});
