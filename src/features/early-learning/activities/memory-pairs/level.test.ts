import { describe, expect, it } from 'vitest';
import { PICTURE_SET_IDS, PICTURE_SETS } from '../../logic/pictures.ts';
import activity from './activity.ts';
import { columnsFor, generateLevel, MAX_DIFFICULTY, type MemoryPairsLevel } from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);

/** What makes a board fair: every picture on exactly two cards, ids unique, every card on the grid. */
function problems(level: MemoryPairsLevel): string[] {
  const found: string[] = [];
  const counts = new Map<string, number>();
  for (const card of level.cards) counts.set(card.picture, (counts.get(card.picture) ?? 0) + 1);
  for (const [picture, count] of counts) if (count !== 2) found.push(`${picture} is on ${String(count)} cards`);
  if (new Set(level.cards.map((card) => card.id)).size !== level.cards.length) found.push('card ids repeat');
  const rows = Math.ceil(level.cards.length / level.columns);
  // The last row is never empty, and no more than one row is short.
  if ((rows - 1) * level.columns >= level.cards.length) found.push('an empty row');
  return found;
}

const setOf = (picture: string) =>
  PICTURE_SET_IDS.find((id) => (PICTURE_SETS[id] as readonly string[]).includes(picture));

describe('generateLevel', () => {
  // The design: pairs per difficulty. Steps of one or two, so no level is a jump.
  it.each([
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 6],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 12],
  ])('at difficulty %i deals %i fair pairs for every seed', (difficulty, pairs) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect(level.cards).toHaveLength(pairs * 2);
    }
  });

  it.each([1, 5])('mixes pictures from different sets at difficulty %i', (difficulty) => {
    const mixed = SEEDS.filter((seed) => {
      const sets = new Set(generateLevel(seed, difficulty, 'band-3-5').cards.map((card) => setOf(card.picture)));
      return sets.size > 1;
    });
    expect(mixed.length).toBeGreaterThan(SEEDS.length * 0.6);
  });

  it.each([6, 10])('draws every picture from one set at difficulty %i, and uses each set', (difficulty) => {
    const sets = new Set<string | undefined>();
    for (const seed of SEEDS) {
      const used = new Set(generateLevel(seed, difficulty, 'band-9-12').cards.map((card) => setOf(card.picture)));
      expect(used.size).toBe(1);
      for (const set of used) sets.add(set);
    }
    expect([...sets].toSorted((a, b) => (a ?? '').localeCompare(b ?? ''))).toEqual(
      [...PICTURE_SET_IDS].toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('memory-pairs is a rounds activity');
    for (const band of activity.bands) {
      const range = activity.difficulty[band];
      if (range === undefined) throw new Error(`No range for ${band}`);
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS.slice(0, 50)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('keeps the youngest band to five pairs or fewer, so a board fits in two short rows', () => {
    if (activity.kind !== 'rounds') throw new Error('memory-pairs is a rounds activity');
    const max = activity.difficulty['band-3-5']?.max ?? 0;
    expect(generateLevel(1, max, 'band-3-5').cards.length).toBeLessThanOrEqual(10);
  });

  it('places the pictures differently for different seeds', () => {
    const orders = new Set(
      SEEDS.slice(0, 20).map((seed) =>
        generateLevel(seed, 3, 'band-3-5')
          .cards.map((c) => c.picture)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(15);
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('columnsFor', () => {
  // The board is twice as wide as tall; these are the grids that make the biggest cards.
  it.each([
    [1, 1],
    [2, 2],
    [4, 2],
    [6, 3],
    [8, 4],
    [10, 5],
    [12, 4],
    [16, 6],
    [18, 6],
    [20, 7],
    [24, 6],
  ])('lays %i cards in rows of %i', (count, columns) => {
    expect(columnsFor(count)).toBe(columns);
  });
});
