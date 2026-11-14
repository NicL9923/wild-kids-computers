import { describe, expect, it } from 'vitest';
import type { Random } from '../../../../core/activityKit/random.ts';
import {
  CATCH_SIZE,
  canCatch,
  catchStepFor,
  EDGE_MARGIN,
  generateLevel,
  MAX_ZOOM_DIFFICULTY,
  placeThings,
  SCENE,
  SPACING,
  STEPS,
  TINY,
  ZOOM_STEPS,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 92_821 + 7);
const DIFFICULTIES = Array.from({ length: MAX_ZOOM_DIFFICULTY }, (_, index) => index + 1);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)(
    'at difficulty %i hides the right number of tiny things, apart and in the picture',
    (difficulty) => {
      const step = STEPS[difficulty - 1];
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const targets = level.things.filter((thing) => thing.isTarget);
        expect(targets).toHaveLength(step?.targets ?? -1);
        expect(level.things).toHaveLength((step?.targets ?? 0) + (step?.others ?? 0));
        // Never ambiguous: every thing of the asked-for kind counts, and nothing else does.
        for (const thing of level.things) expect(thing.isTarget).toBe(thing.kind === level.target);
        expect(TINY).toContain(level.target);
        expect(new Set(level.things.map((thing) => thing.id)).size).toBe(level.things.length);
        level.things.forEach((thing, index) => {
          expect(thing.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
          expect(thing.x).toBeLessThanOrEqual(SCENE.width - EDGE_MARGIN);
          expect(thing.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
          expect(thing.y).toBeLessThanOrEqual(SCENE.height - EDGE_MARGIN);
          for (const other of level.things.slice(index + 1)) {
            expect(Math.hypot(thing.x - other.x, thing.y - other.y), `seed ${String(seed)}`).toBeGreaterThanOrEqual(
              level.size * SPACING,
            );
          }
        });
      }
    },
  );

  it.each(DIFFICULTIES)('at difficulty %i needs zoom to catch anything, and the most zoom is enough', (difficulty) => {
    const level = generateLevel(1, difficulty, 'band-6-8');
    expect(canCatch(level.size, 0)).toBe(false);
    expect(level.catchStep).toBeGreaterThan(0);
    expect(canCatch(level.size, ZOOM_STEPS.length - 1)).toBe(true);
    expect(canCatch(level.size, level.catchStep)).toBe(true);
    expect(canCatch(level.size, level.catchStep - 1)).toBe(false);
  });

  it('asks for more zoom, more finds, or more look-alikes one step at a time', () => {
    expect(STEPS.map((step) => `${String(step.targets)} of ${String(step.size)} among ${String(step.others)}`)).toEqual(
      [
        '1 of 34 among 3',
        '1 of 26 among 4',
        '2 of 26 among 4',
        '2 of 22 among 6',
        '2 of 17 among 6',
        '3 of 17 among 8',
        '3 of 13 among 8',
        '3 of 11 among 10',
      ],
    );
    expect(DIFFICULTIES.map((difficulty) => generateLevel(3, difficulty, 'band-9-12').catchStep)).toEqual([
      2, 3, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it('lists the tiny things in reading order, so Tab goes left to right and top to bottom', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { things } = generateLevel(seed, 8, 'band-9-12');
      const order = things.map((thing) => thing.id);
      const reading = things.toSorted((a, b) => a.y - b.y || a.x - b.x).map((thing) => thing.id);
      expect(order).toEqual(reading);
      expect(order).toEqual(things.map((_, index) => `thing-${String(index)}`));
    }
  });

  it('scatters the tiny things in new places for each seed, not in a fixed grid', () => {
    const firsts = new Set(
      SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateLevel(seed, 8, 'band-9-12').things[0])),
    );
    expect(firsts.size).toBeGreaterThan(50);
  });

  it('places five pieces of scenery inside the picture, shifted a little either way', () => {
    const shifts = { x: [] as number[], y: [] as number[] };
    for (const seed of SEEDS.slice(0, 50)) {
      const { scenery } = generateLevel(seed, 4, 'band-6-8');
      expect(scenery).toHaveLength(5);
      expect(new Set(scenery.map((piece) => piece.kind)).size).toBe(5);
      shifts.x.push(...scenery.map((piece, index) => piece.x - ([120, 330, 520, 720, 880][index] ?? piece.x)));
      shifts.y.push(...scenery.map((piece, index) => piece.y - ([400, 470, 380, 470, 390][index] ?? piece.y)));
      for (const piece of scenery) {
        expect(piece.x - piece.size / 2).toBeGreaterThanOrEqual(0);
        expect(piece.x + piece.size / 2).toBeLessThanOrEqual(SCENE.width);
        expect(piece.y + piece.size / 2).toBeLessThanOrEqual(SCENE.height);
      }
    }
    for (const axis of ['x', 'y'] as const) {
      expect(Math.min(...shifts[axis]), axis).toBeLessThan(0);
      expect(Math.max(...shifts[axis]), axis).toBeGreaterThan(0);
    }
  });

  it.each([0, MAX_ZOOM_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-6-8')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('canCatch', () => {
  it('catches exactly at the catch size and not one unit below', () => {
    expect(canCatch(CATCH_SIZE / 2, 2)).toBe(true);
    expect(canCatch(CATCH_SIZE / 2 - 0.5, 2)).toBe(false);
    expect(canCatch(100, ZOOM_STEPS.length)).toBe(false);
  });

  it('gives no catch step to a thing too small for the most zoom', () => {
    expect(catchStepFor(1)).toBe(-1);
  });
});

describe('placeThings', () => {
  const stuck: Random = {
    next: () => 0.5,
    int: (min, max) => Math.round((min + max) / 2),
    pick: (items) => {
      const item = items[0];
      if (item === undefined) throw new RangeError('empty');
      return item;
    },
    shuffle: (items) => [...items],
    sample: (items, count) => items.slice(0, count),
  };

  it('falls back to a spread-out grid when random spots find no room', () => {
    const spots = placeThings(stuck, 13, 34);
    expect(spots).toHaveLength(13);
    spots.forEach((spot, index) => {
      for (const other of spots.slice(index + 1)) {
        expect(Math.hypot(spot.x - other.x, spot.y - other.y)).toBeGreaterThanOrEqual(34 * SPACING);
      }
      expect(spot.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(spot.x).toBeLessThanOrEqual(SCENE.width - EDGE_MARGIN);
      expect(spot.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(spot.y).toBeLessThanOrEqual(SCENE.height - EDGE_MARGIN);
    });
  });
});
