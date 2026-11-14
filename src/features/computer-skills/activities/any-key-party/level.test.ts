import { describe, expect, it } from 'vitest';
import { FRIEND_SIZE, FRIENDS, generateLevel, GRID, MAX_PARTY_DIFFICULTY, MEADOW, PRESSES } from './level.ts';

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 6007 + 1);
const DIFFICULTIES = Array.from({ length: MAX_PARTY_DIFFICULTY }, (_, index) => index + 1);

/** How far a center is from the middle of the grid cell it sits in. */
const shift = (value: number, cell: number) => value - (Math.floor(value / cell) * cell + cell / 2);

describe('generateLevel', () => {
  it.each(DIFFICULTIES)(
    'at difficulty %i brings different friends that fit and never cover each other',
    (difficulty) => {
      for (const seed of SEEDS) {
        const { friends } = generateLevel(seed, difficulty, 'band-3-5');
        expect(friends).toHaveLength(PRESSES[difficulty - 1] ?? -1);
        expect(new Set(friends.map((friend) => friend.emoji)).size).toBe(friends.length);
        expect(new Set(friends.map((friend) => friend.id)).size).toBe(friends.length);
        const r = FRIEND_SIZE / 2;
        friends.forEach((friend, index) => {
          expect(FRIENDS).toContain(friend.emoji);
          expect(friend.x - r).toBeGreaterThanOrEqual(0);
          expect(friend.x + r).toBeLessThanOrEqual(MEADOW.width);
          expect(friend.y - r).toBeGreaterThanOrEqual(0);
          expect(friend.y + r).toBeLessThanOrEqual(MEADOW.height);
          for (const other of friends.slice(index + 1)) {
            // Square pictures: apart on at least one axis by a full size.
            const apart = Math.max(Math.abs(friend.x - other.x), Math.abs(friend.y - other.y));
            expect(apart, `seed ${String(seed)}`).toBeGreaterThanOrEqual(FRIEND_SIZE);
          }
        });
      }
    },
  );

  it('fills the meadow with a few more presses at each difficulty, from four to eight', () => {
    expect(DIFFICULTIES.map((difficulty) => generateLevel(9, difficulty, 'band-3-5').friends.length)).toEqual([
      4, 5, 6, 8,
    ]);
  });

  it.each(['x', 'y'] as const)('shifts friends both ways along %s from the middle of their cells', (axis) => {
    const cell = axis === 'x' ? MEADOW.width / GRID.columns : MEADOW.height / GRID.rows;
    const shifts = SEEDS.slice(0, 80).flatMap((seed) =>
      generateLevel(seed, 4, 'band-3-5').friends.map((friend) => shift(friend[axis], cell)),
    );
    expect(Math.min(...shifts)).toBeLessThan(0);
    expect(Math.max(...shifts)).toBeGreaterThan(0);
  });

  it('moves friends around from seed to seed', () => {
    const firsts = new Set(
      SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateLevel(seed, 1, 'band-3-5').friends[0])),
    );
    expect(firsts.size).toBeGreaterThan(40);
  });

  it.each([0, MAX_PARTY_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 4, not/);
  });
});
