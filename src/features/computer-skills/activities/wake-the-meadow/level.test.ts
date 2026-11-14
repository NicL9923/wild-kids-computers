import { describe, expect, it } from 'vitest';
import {
  budsWokenBy,
  distanceToSegment,
  EDGE_MARGIN,
  FLOWERS,
  generateLevel,
  MAX_MEADOW_DIFFICULTY,
  MEADOW,
  stepFor,
  type MeadowLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 11);
const DIFFICULTIES = Array.from({ length: MAX_MEADOW_DIFFICULTY }, (_, index) => index + 1);

/** Every rule that makes a meadow fair for a 3-year-old, checked from the level alone. */
function problems(level: MeadowLevel): string[] {
  const found: string[] = [];
  const r = level.size / 2;
  if (new Set(level.buds.map((bud) => bud.id)).size !== level.buds.length) found.push('bud ids repeat');
  level.buds.forEach((bud, index) => {
    if (bud.x - r < EDGE_MARGIN || bud.x + r > MEADOW.width - EDGE_MARGIN) found.push(`${bud.id} leaves sideways`);
    if (bud.y - r < EDGE_MARGIN || bud.y + r > MEADOW.height - EDGE_MARGIN) found.push(`${bud.id} leaves the meadow`);
    for (const other of level.buds.slice(index + 1)) {
      // A quarter of a bud between neighbors, so each one opens on its own.
      if (Math.hypot(bud.x - other.x, bud.y - other.y) < level.size * 1.25) found.push(`${bud.id} crowds ${other.id}`);
    }
  });
  if (level.needed >= level.buds.length) found.push('every last bud is needed');
  if (level.needed < level.buds.length / 2) found.push('less than half the meadow is needed');
  return found;
}

/** The buds a pointer wakes moving straight across the meadow at one height. */
function sweep(level: MeadowLevel, y: number): Set<string> {
  return new Set(budsWokenBy(level, { x: 0, y }, { x: MEADOW.width, y }));
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i gives a fair meadow for every seed', (difficulty) => {
    const step = stepFor(difficulty);
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      expect(level.buds).toHaveLength(step.columns * step.rows);
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it.each(DIFFICULTIES)('at difficulty %i wakes every bud with one sweep along each row', (difficulty) => {
    const { rows } = stepFor(difficulty);
    const rowHeight = (MEADOW.height - 2 * EDGE_MARGIN) / rows;
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-3-5');
      const woken = new Set<string>();
      for (let row = 0; row < rows; row += 1) {
        for (const id of sweep(level, EDGE_MARGIN + (row + 0.5) * rowHeight)) woken.add(id);
      }
      expect(woken.size, `seed ${String(seed)}`).toBe(level.buds.length);
    }
  });

  it('wakes the whole meadow with one sweep across the middle at the easiest', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, 1, 'band-3-5');
      expect(sweep(level, MEADOW.height / 2).size, `seed ${String(seed)}`).toBe(level.buds.length);
    }
  });

  it('asks for more of the meadow with a smaller reach as the difficulty rises', () => {
    const levels = DIFFICULTIES.map((difficulty) => generateLevel(5, difficulty, 'band-3-5'));
    // The design: 8 buds at first and 28 at the hardest, three quarters of them to wake.
    expect(levels.map((level) => level.buds.length)).toEqual([8, 10, 15, 18, 21, 28]);
    expect(levels.map((level) => level.needed)).toEqual([6, 8, 12, 14, 16, 21]);
    for (let index = 1; index < levels.length; index += 1) {
      const before = levels[index - 1];
      const after = levels[index];
      if (before === undefined || after === undefined) throw new Error('missing level');
      expect(after.reach).toBeLessThan(before.reach);
      // Small steps: the reach shrinks by at most 20 units, and at most seven buds join.
      expect(before.reach - after.reach).toBeLessThanOrEqual(20);
      expect(after.buds.length - before.buds.length).toBeLessThanOrEqual(7);
    }
  });

  it('keeps every bud well above the youngest band target at a 1280 by 800 window', () => {
    // The meadow is about 1080 pixels wide there, so a unit is at least one pixel.
    for (const difficulty of DIFFICULTIES)
      expect(generateLevel(1, difficulty, 'band-3-5').size).toBeGreaterThanOrEqual(72);
  });

  it('nudges buds off their grid, so meadows differ from seed to seed', () => {
    const firstBuds = new Set(
      SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateLevel(seed, 3, 'band-3-5').buds[0])),
    );
    expect(firstBuds.size).toBeGreaterThan(30);
    expect(generateLevel(42, 4, 'band-3-5')).toEqual(generateLevel(42, 4, 'band-3-5'));
  });

  it('nudges each bud up, down, left, and right of its cell center across seeds', () => {
    const firsts = SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5').buds[0]);
    const xs = new Set(firsts.map((bud) => bud?.x));
    const ys = new Set(firsts.map((bud) => bud?.y));
    expect(xs.size).toBeGreaterThan(10);
    expect(ys.size).toBeGreaterThan(10);
  });

  it('opens every kind of flower across meadows', () => {
    const kinds = new Set(
      SEEDS.slice(0, 40).flatMap((seed) => generateLevel(seed, 6, 'band-3-5').buds.map((bud) => bud.flower)),
    );
    expect([...kinds].toSorted()).toEqual([...FLOWERS].toSorted());
  });

  it.each([0, MAX_MEADOW_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 6, not/);
  });
});

describe('distanceToSegment', () => {
  it.each([
    ['beside the middle', { x: 50, y: 30 }, 30],
    ['before the start', { x: -40, y: 30 }, 50],
    ['past the end', { x: 160, y: -80 }, 100],
    ['on the segment', { x: 70, y: 0 }, 0],
  ])('measures a point %s', (_label, point, distance) => {
    expect(distanceToSegment(point, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(distance, 6);
  });

  it('measures to a single point when the segment has no length', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('works along a slanted segment away from the origin', () => {
    expect(distanceToSegment({ x: 100, y: 210 }, { x: 100, y: 200 }, { x: 110, y: 210 })).toBeCloseTo(
      Math.SQRT2 * 5,
      6,
    );
  });
});

describe('budsWokenBy', () => {
  const level = {
    reach: 50,
    buds: [
      { id: 'near', x: 500, y: 300, flower: 'tulip' },
      { id: 'edge', x: 500, y: 350, flower: 'rose' },
      { id: 'far', x: 500, y: 351, flower: 'rose' },
      { id: 'ahead', x: 900, y: 300, flower: 'flower' },
    ],
  } as const;

  it('wakes buds within reach of the whole path between two pointer events, both sides of the edge', () => {
    expect(budsWokenBy(level, { x: 100, y: 300 }, { x: 800, y: 300 })).toEqual(['near', 'edge']);
  });

  it('wakes buds near a resting pointer', () => {
    expect(budsWokenBy(level, { x: 900, y: 340 }, { x: 900, y: 340 })).toEqual(['ahead']);
  });
});
