import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import type { Band } from '../../../../core/bands.ts';
import { SCATTER_BOARD } from '../../math/scatter.ts';
import {
  countSets,
  generateLevel,
  MAX_MORE_DIFFICULTY,
  placeGroups,
  THINGS,
  tierFor,
  type MoreLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: counts that all differ, one group that answers, things that never touch. */
function problems(level: MoreLevel, difficulty: number): string[] {
  const tier = tierFor(difficulty);
  const found: string[] = [];
  const counts = level.groups.map((group) => group.count);
  if (new Set(counts).size !== counts.length) found.push('two groups have the same count');
  if (level.groups.length !== tier.groups) found.push(`${String(level.groups.length)} groups`);
  const sorted = counts.toSorted((a, b) => a - b);
  sorted.forEach((count, index) => {
    if (count < tier.min || count > tier.max) found.push(`${String(count)} outside the tier`);
    const before = sorted[index - 1];
    if (before !== undefined && (count - before < tier.gap[0] || count - before > tier.gap[1])) {
      found.push(`${String(before)} and ${String(count)} are not a fair gap apart`);
    }
  });
  const wanted = level.ask === 'more' || level.ask === 'most' ? Math.max(...counts) : Math.min(...counts);
  if (level.groups.find((group) => group.id === level.answer)?.count !== wanted)
    found.push('the answer is not the asked group');
  if (!tier.asks.includes(level.ask)) found.push(`asks ${level.ask}`);
  for (const group of level.groups) {
    if (group.spots === null) {
      if (level.arrangement === 'scatter') found.push(`${group.id} has no spots`);
      continue;
    }
    if (group.spots.length !== group.count) found.push(`${group.id} spots do not match`);
    const r = level.size / 2;
    group.spots.forEach((spot, index) => {
      if (spot.x - r < 0 || spot.y - r < 0 || spot.x + r > SCATTER_BOARD.width || spot.y + r > SCATTER_BOARD.height) {
        found.push(`${group.id} spills off its card`);
      }
      for (const other of group.spots?.slice(index + 1) ?? []) {
        if (Math.hypot(spot.x - other.x, spot.y - other.y) < level.size) found.push(`${group.id} things touch`);
      }
    });
  }
  return found;
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_MORE_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round for every seed',
    (difficulty) => {
      for (const seed of SEEDS) {
        expect(problems(generateLevel(seed, difficulty, 'band-6-8'), difficulty), `seed ${String(seed)}`).toEqual([]);
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, number, readonly string[], string]>([
    ['band-3-5', 1, 2, ['more'], 'rows'],
    ['band-3-5', 5, 2, ['fewer', 'more'], 'scatter'],
    ['band-6-8', 3, 2, ['fewer', 'more'], 'rows'],
    ['band-6-8', 8, 3, ['fewest', 'most'], 'scatter'],
  ])(
    'in %s at difficulty %i shows %i groups, asks %j, and lays them in %s',
    (band, difficulty, groups, asks, arrangement) => {
      const levels = SEEDS.map((seed) => generateLevel(seed, difficulty, band));
      expect([...new Set(levels.map((level) => level.ask))].toSorted()).toEqual(asks);
      for (const level of levels) {
        expect(level.groups).toHaveLength(groups);
        expect(level.arrangement).toBe(arrangement);
        expect(problems(level, difficulty)).toEqual([]);
      }
    },
  );

  it('starts with groups at least three apart and ends with neighbors one apart', () => {
    const first = SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5'));
    for (const level of first) {
      const [a, b] = level.groups.map((group) => group.count);
      expect(Math.abs((a ?? 0) - (b ?? 0))).toBeGreaterThanOrEqual(3);
    }
    const last = SEEDS.map((seed) => generateLevel(seed, MAX_MORE_DIFFICULTY, 'band-6-8'));
    expect(
      last.some((level) => {
        const sorted = level.groups.map((group) => group.count).toSorted((a, b) => a - b);
        return sorted.some((count, index) => index > 0 && count - (sorted[index - 1] ?? 0) === 1);
      }),
    ).toBe(true);
  });

  it('puts the answer in every place, and asks both ways', () => {
    const levels = SEEDS.map((seed) => generateLevel(seed, 7, 'band-6-8'));
    expect(new Set(levels.map((level) => level.answer))).toEqual(new Set(['group-0', 'group-1', 'group-2']));
    const fewest = levels.filter((level) => level.ask === 'fewest');
    expect(fewest.length).toBeGreaterThan(SEEDS.length / 4);
  });

  it('uses every kind of thing across rounds', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-3-5').kind));
    expect([...kinds].toSorted()).toEqual([...THINGS].toSorted());
  });

  it.each([0, MAX_MORE_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('countSets', () => {
  it('lists every pair or triple whose neighbors differ by a gap in range', () => {
    expect(countSets({ min: 1, max: 5, groups: 2, gap: [3, 4], asks: ['more'], arrangement: 'rows' })).toEqual([
      [1, 4],
      [1, 5],
      [2, 5],
    ]);
    expect(countSets({ min: 1, max: 4, groups: 3, gap: [1, 2], asks: ['most'], arrangement: 'rows' })).toEqual([
      [1, 2, 3],
      [1, 2, 4],
      [1, 3, 4],
      [2, 3, 4],
    ]);
  });
});

/** A generator that always picks the same spot, so only one thing fits on a board. */
const stuck: Random = {
  next: () => 0.5,
  int: (min, max) => Math.round((min + max) / 2),
  pick: (items) => {
    for (const item of items) return item;
    throw new RangeError('empty');
  },
  shuffle: (items) => [...items],
  sample: (items, count) => items.slice(0, count),
};

describe('placeGroups', () => {
  it('falls back to rows for every group when one group does not fit', () => {
    expect(placeGroups(stuck, [1, 2], 50, 'scatter')).toEqual({ arrangement: 'rows', spots: null });
  });

  it('scatters every group that fits', () => {
    expect(placeGroups(stuck, [1, 1], 50, 'scatter')).toEqual({
      arrangement: 'scatter',
      spots: [[{ x: 200, y: 180 }], [{ x: 200, y: 180 }]],
    });
  });

  it('keeps rows as asked', () => {
    expect(placeGroups(stuck, [3, 6], 50, 'rows')).toEqual({ arrangement: 'rows', spots: null });
  });
});
