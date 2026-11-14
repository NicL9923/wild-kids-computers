import { describe, expect, it } from 'vitest';
import { createRandom, type Random } from '../../../core/activityKit/random.ts';
import { SCATTER_BOARD, scatterSize, scatterSpots } from './scatter.ts';

describe('scatterSize', () => {
  it.each([
    [1, 100],
    [5, 100],
    [6, 72],
    [10, 72],
    [11, 58],
    [15, 58],
    [16, 52],
    [20, 52],
  ])('gives %i things a width of %i', (count, size) => {
    expect(scatterSize(count)).toBe(size);
  });
});

describe('scatterSpots', () => {
  it('places up to twenty things on the board without touching, for many seeds', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      for (const count of [5, 10, 15, 20]) {
        const size = scatterSize(count);
        const spots = scatterSpots(createRandom(seed * 7919 + count), count, size);
        if (spots === null) throw new Error(`seed ${String(seed)}: ${String(count)} things did not fit`);
        expect(spots).toHaveLength(count);
        spots.forEach((spot, index) => {
          expect(spot.x - size / 2).toBeGreaterThanOrEqual(0);
          expect(spot.y - size / 2).toBeGreaterThanOrEqual(0);
          expect(spot.x + size / 2).toBeLessThanOrEqual(SCATTER_BOARD.width);
          expect(spot.y + size / 2).toBeLessThanOrEqual(SCATTER_BOARD.height);
          for (const other of spots.slice(index + 1)) {
            expect(Math.hypot(spot.x - other.x, spot.y - other.y)).toBeGreaterThanOrEqual(size * 1.16);
          }
        });
      }
    }
  });

  it('gives up when the things cannot all fit', () => {
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
    expect(scatterSpots(stuck, 2, 50)).toBeNull();
    expect(scatterSpots(stuck, 1, 50)).toEqual([{ x: 200, y: 180 }]);
  });
});
