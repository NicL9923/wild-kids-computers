import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import {
  BED,
  FLOWERS,
  flowerSize,
  generateLevel,
  MAX_FLOWER_DIFFICULTY,
  scatterSpacing,
  TIERS,
  tierFor,
  type FlowersLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 104_729 + 3);

/** What makes a round fair: the right number of flowers, none hidden or overlapping, one right answer. */
function problems(level: FlowersLevel): string[] {
  const found: string[] = [];
  if (level.flowers.length !== level.count)
    found.push(`${String(level.flowers.length)} flowers for ${String(level.count)}`);
  const r = level.size / 2;
  const apart = level.arrangement === 'scatter' ? scatterSpacing(level.size) : level.size;
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
