import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import type { Random } from '../../../../core/activityKit/random.ts';
import {
  BED,
  FLOWERS,
  flowerSize,
  generateLevel,
  MAX_FLOWER_DIFFICULTY,
  placeFlowers,
  rowsLayout,
  scatterLayout,
  TIERS,
  tierFor,
  type Flower,
  type FlowersLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: the right number of flowers, none hidden or overlapping, one right answer. */
function problems(level: FlowersLevel): string[] {
  const found: string[] = [];
  if (level.flowers.length !== level.count)
    found.push(`${String(level.flowers.length)} flowers for ${String(level.count)}`);
  const r = level.size / 2;
  // Scattered flowers keep a tenth of their size apart; rows keep more.
  const apart = level.size * 1.1;
  if (new Set(level.flowers.map((flower) => flower.id)).size !== level.count) found.push('flower ids repeat');
  level.flowers.forEach((flower, index) => {
    if (flower.x - r < 0 || flower.x + r > BED.width || flower.y - r < 0 || flower.y + r > BED.height) {
      found.push(`${flower.id} leaves the bed`);
    }
    for (const other of level.flowers.slice(index + 1)) {
      if (Math.hypot(flower.x - other.x, flower.y - other.y) < apart) found.push(`${flower.id} overlaps ${other.id}`);
    }
  });
  if (level.choices.filter((choice) => choice === level.count).length !== 1)
    found.push('the answer is not offered once');
  if (new Set(level.choices).size !== level.choices.length) found.push('a choice repeats');
  if (level.choices.some((choice) => choice < 1)) found.push('a choice is below 1');
  if (level.choices.some((choice) => Math.abs(choice - level.count) > 3)) found.push('a choice is far from the answer');
  if (level.choices.some((choice, index) => index > 0 && choice < (level.choices[index - 1] ?? 0))) {
    found.push('the choices are not in order');
  }
  return found;
}

describe('generateLevel', () => {
  it.each(Array.from({ length: MAX_FLOWER_DIFFICULTY }, (_, index) => index + 1))(
    'at difficulty %i gives a fair round within the tier for every seed',
    (difficulty) => {
      const tier = tierFor(difficulty);
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.count).toBeGreaterThanOrEqual(tier.min);
        expect(level.count).toBeLessThanOrEqual(tier.max);
        expect(level.choices).toHaveLength(tier.choices);
        expect(level.size).toBe(flowerSize(level.count));
      }
    },
  );

  // The edges of each band's range in activity.ts.
  it.each<[Band, number, number, number]>([
    ['band-3-5', 1, 1, 3],
    ['band-3-5', 5, 4, 8],
    ['band-6-8', 3, 2, 5],
    ['band-6-8', 10, 12, 20],
  ])('in %s at difficulty %i asks for %i to %i flowers', (band, difficulty, min, max) => {
    const counts = SEEDS.map((seed) => generateLevel(seed, difficulty, band).count);
    expect(Math.min(...counts)).toBe(min);
    expect(Math.max(...counts)).toBe(max);
  });

  it('puts the answer in every position over many rounds, so the middle is not always right', () => {
    const positions = new Set(
      SEEDS.map((seed) => {
        const level = generateLevel(seed, 4, 'band-3-5');
        return level.choices.indexOf(level.count);
      }),
    );
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('sometimes offers 1 when the answer is 2', () => {
    const twos = SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5')).filter((level) => level.count === 2);
    expect(twos.some((level) => level.choices.includes(1))).toBe(true);
  });

  it.each([
    [1, 'row'],
    [2, 'row'],
    [3, 'rows'],
    [4, 'rows'],
    [5, 'scatter'],
    [6, 'rows'],
    [7, 'scatter'],
    [8, 'scatter'],
    [9, 'scatter'],
    [10, 'scatter'],
  ] as const)('at difficulty %i arranges the flowers as %s', (difficulty, arrangement) => {
    const arrangements = SEEDS.slice(0, 60).map((seed) => generateLevel(seed, difficulty, 'band-6-8').arrangement);
    expect(arrangements.filter((each) => each === arrangement).length).toBeGreaterThan(54);
  });

  it('offers no number below 1 when the answer is 1', () => {
    const ones = SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5')).filter((level) => level.count === 1);
    expect(ones.length).toBeGreaterThan(0);
    for (const level of ones) expect(Math.min(...level.choices)).toBe(1);
  });

  it('starts with one neat row and ends with a scattered patch', () => {
    expect(generateLevel(5, 1, 'band-3-5').arrangement).toBe('row');
    const easiest = generateLevel(5, 1, 'band-3-5');
    expect(new Set(easiest.flowers.map((flower) => flower.y)).size).toBe(1);
    const scattered = SEEDS.map((seed) => generateLevel(seed, MAX_FLOWER_DIFFICULTY, 'band-6-8').arrangement);
    expect(scattered.filter((arrangement) => arrangement === 'scatter').length).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('lays rows of at most five, like a ten frame', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const level = generateLevel(seed, 6, 'band-6-8');
      if (level.arrangement !== 'rows') continue;
      const perRow = new Map<number, number>();
      for (const flower of level.flowers) perRow.set(flower.y, (perRow.get(flower.y) ?? 0) + 1);
      expect(Math.max(...perRow.values())).toBeLessThanOrEqual(5);
    }
  });

  it('uses every kind of flower across rounds, one kind per round', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, 2, 'band-3-5').kind));
    expect([...kinds].toSorted()).toEqual([...FLOWERS].toSorted());
  });

  it('repeats a round for the same seed and changes it for another', () => {
    expect(generateLevel(9, 5, 'band-3-5')).toEqual(generateLevel(9, 5, 'band-3-5'));
    expect(generateLevel(9, 5, 'band-3-5')).not.toEqual(generateLevel(10, 5, 'band-3-5'));
  });

  it('grows by small steps: each level up raises the most flowers by at most three', () => {
    for (let index = 1; index < TIERS.length; index += 1) {
      const step = (TIERS[index]?.max ?? 0) - (TIERS[index - 1]?.max ?? 0);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(3);
    }
  });

  it.each([0, MAX_FLOWER_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('flowerSize', () => {
  it.each([
    [1, 170],
    [4, 170],
    [5, 130],
    [8, 130],
    [9, 105],
    [12, 105],
    [13, 82],
    [20, 82],
  ])('gives %i flowers a size of %i', (count, size) => {
    expect(flowerSize(count)).toBe(size);
  });
});

/** The flowers grouped into rows by height, top row first. */
function rowsOf(flowers: readonly Flower[]): Flower[][] {
  const rows = new Map<number, Flower[]>();
  for (const flower of flowers) rows.set(flower.y, [...(rows.get(flower.y) ?? []), flower]);
  return [...rows.entries()].toSorted(([a], [b]) => a - b).map(([, row]) => row);
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('rowsLayout', () => {
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))('lays %i flowers in even, centered rows', (count) => {
    const size = flowerSize(count);
    const flowers = rowsLayout(count, size);
    const rows = rowsOf(flowers);
    const lengths = rows.map((row) => row.length);
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(count);
    expect(rows).toHaveLength(Math.ceil(count / 5));
    // As even as can be: rows differ by at most one, the longer rows first, none over five.
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
    expect(lengths).toEqual(lengths.toSorted((a, b) => b - a));
    expect(Math.max(...lengths)).toBeLessThanOrEqual(5);
    for (const row of rows)
      expect(Math.abs(mean(row.map((flower) => flower.x)) - BED.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(mean(rows.map((row) => row[0]?.y ?? 0)) - BED.height / 2)).toBeLessThanOrEqual(1);
    // Every flower stays in the bed with room around it.
    for (const flower of flowers) {
      expect(flower.x - size / 2).toBeGreaterThanOrEqual(0);
      expect(flower.x + size / 2).toBeLessThanOrEqual(BED.width);
      expect(flower.y - size / 2).toBeGreaterThanOrEqual(0);
      expect(flower.y + size / 2).toBeLessThanOrEqual(BED.height);
    }
  });

  it('spaces neighbors evenly, apart but close enough to read as a group', () => {
    for (const count of [3, 5, 8, 10, 20]) {
      const size = flowerSize(count);
      const rows = rowsOf(rowsLayout(count, size));
      for (const row of rows) {
        for (let index = 1; index < row.length; index += 1) {
          const step = (row[index]?.x ?? 0) - (row[index - 1]?.x ?? 0);
          expect(step).toBeGreaterThanOrEqual(size * 1.2);
          expect(step).toBeLessThanOrEqual(size * 1.5 + 1);
        }
      }
      for (let index = 1; index < rows.length; index += 1) {
        const step = (rows[index]?.[0]?.y ?? 0) - (rows[index - 1]?.[0]?.y ?? 0);
        expect(step).toBeGreaterThanOrEqual(size * 1.1);
        expect(step).toBeLessThanOrEqual(size * 1.25 + 1);
      }
    }
  });

  it('lists flowers in reading order, so Tab moves left to right, top to bottom', () => {
    const flowers = rowsLayout(8, flowerSize(8));
    for (let index = 1; index < flowers.length; index += 1) {
      const before = flowers[index - 1];
      const after = flowers[index];
      if (before === undefined || after === undefined) continue;
      expect(after.y > before.y || (after.y === before.y && after.x > before.x)).toBe(true);
    }
    expect(flowers.map((flower) => flower.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => `flower-${String(index)}`),
    );
  });
});

/** A generator that always picks the same spot, so only one flower ever fits. */
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

describe('scatterLayout and placeFlowers', () => {
  it('finds no room when the flowers cannot all fit', () => {
    expect(scatterLayout(stuck, 2, 100)).toBeNull();
  });

  it('places one flower at the spot it is given', () => {
    expect(scatterLayout(stuck, 1, 100)).toEqual([{ id: 'flower-0', x: 500, y: 220 }]);
  });

  it('falls back to rows rather than overlapping flowers', () => {
    expect(placeFlowers(stuck, 6, 130, 'scatter')).toEqual({ flowers: rowsLayout(6, 130), arrangement: 'rows' });
  });

  it('keeps rows and a single row as asked', () => {
    expect(placeFlowers(stuck, 3, 170, 'row')).toEqual({ flowers: rowsLayout(3, 170), arrangement: 'row' });
  });
});
