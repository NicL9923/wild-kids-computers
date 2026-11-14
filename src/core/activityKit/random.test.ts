import { describe, expect, it } from 'vitest';
import { createRandom, roundSeed } from './random.ts';

function draw(seed: number): number[] {
  const random = createRandom(seed);
  return Array.from({ length: 8 }, () => random.next());
}

const byValue = (a: number, b: number) => a - b;

/** The order createRandom(1) gives five items. Levels in tests depend on it. */
const SHUFFLE_OF_SEED_1 = [4, 1, 3, 5, 2];

describe('createRandom', () => {
  it('repeats the same sequence for the same seed and differs for another seed', () => {
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it('pins the first draws of a known seed, so a level never changes under a saved seed', () => {
    // Levels in end-to-end tests and saved test seeds depend on this exact sequence.
    const random = createRandom(1);
    expect([random.next(), random.next(), random.next()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
  });

  it('draws floats in [0, 1) at the extreme seeds', () => {
    for (const seed of [0, 4_294_967_295]) {
      const random = createRandom(seed);
      for (let i = 0; i < 1000; i += 1) {
        const value = random.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it.each([-1, 4_294_967_296, 1.5, Number.NaN])('rejects the seed %s', (seed) => {
    expect(() => createRandom(seed)).toThrow(/A seed must be a whole number from 0 to 4294967295/);
  });

  describe('int', () => {
    it('reaches both ends of the range and nothing outside it', () => {
      const random = createRandom(7);
      const seen = new Set<number>();
      for (let i = 0; i < 500; i += 1) seen.add(random.int(3, 6));
      expect([...seen].toSorted(byValue)).toEqual([3, 4, 5, 6]);
    });

    it('returns the only value of a one-value range', () => {
      expect(createRandom(9).int(5, 5)).toBe(5);
    });

    it('rejects a range with min above max', () => {
      expect(() => createRandom(1).int(4, 3)).toThrow(/min <= max, not 4 > 3/);
    });

    it.each([
      [1.5, 3],
      [1, 2.5],
    ])('rejects the bounds %s and %s', (min, max) => {
      expect(() => createRandom(1).int(min, max)).toThrow(/int needs whole numbers/);
    });
  });

  describe('pick', () => {
    it('reaches every item', () => {
      const random = createRandom(11);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i += 1) seen.add(random.pick(['a', 'b', 'c']));
      expect([...seen].toSorted((a, b) => a.localeCompare(b))).toEqual(['a', 'b', 'c']);
    });

    it('rejects an empty list', () => {
      expect(() => createRandom(1).pick([])).toThrow(/at least one item/);
    });
  });

  describe('shuffle', () => {
    it('keeps every item once and leaves the input alone', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8];
      const shuffled = createRandom(5).shuffle(input);
      expect(shuffled.toSorted((a, b) => a - b)).toEqual(input);
      expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('pins the order of a known seed, so a level never changes under a saved seed', () => {
      expect(createRandom(1).shuffle([1, 2, 3, 4, 5])).toEqual(SHUFFLE_OF_SEED_1);
    });

    it('produces more than one order over many seeds, including moving the first item', () => {
      const orders = new Set<string>();
      const firsts = new Set<number>();
      for (let seed = 0; seed < 60; seed += 1) {
        const shuffled = createRandom(seed).shuffle([1, 2, 3]);
        orders.add(shuffled.join(''));
        firsts.add(shuffled[0] ?? 0);
      }
      expect(orders.size).toBe(6);
      expect([...firsts].toSorted(byValue)).toEqual([1, 2, 3]);
    });
  });

  describe('sample', () => {
    it('takes distinct items without replacement', () => {
      const picked = createRandom(3).sample(['a', 'b', 'c', 'd', 'e'], 3);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
    });

    it('takes every item when asked for all and none when asked for zero', () => {
      expect(createRandom(3).sample([1, 2, 3], 3).toSorted(byValue)).toEqual([1, 2, 3]);
      expect(createRandom(3).sample([1, 2, 3], 0)).toEqual([]);
    });

    it.each([-1, 4, 1.5])('rejects the count %s for three items', (count) => {
      expect(() => createRandom(3).sample([1, 2, 3], count)).toThrow(/sample needs a count from 0 to 3/);
    });
  });
});

describe('roundSeed', () => {
  it('gives each round of a session its own seed and repeats for the same inputs', () => {
    const seeds = Array.from({ length: 20 }, (_, round) => roundSeed(1234, round));
    expect(new Set(seeds).size).toBe(20);
    expect(roundSeed(1234, 3)).toBe(seeds[3]);
    expect(roundSeed(1235, 3)).not.toBe(seeds[3]);
  });

  it('pins a known value, because end-to-end tests compute levels from it', () => {
    expect([roundSeed(0, 0), roundSeed(7, 1)]).toEqual([301_794_027, 2_902_783_164]);
  });

  it('returns a valid seed for createRandom at the edges', () => {
    for (const seed of [roundSeed(0, 0), roundSeed(4_294_967_295, 1_000_000)]) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(4_294_967_296);
    }
  });

  it.each([
    [-1, 0, /session seed/],
    [1.5, 0, /session seed/],
    [1, -1, /round index/],
    [1, 0.5, /round index/],
  ])('rejects session seed %s and round %s', (session, round, reason) => {
    expect(() => roundSeed(session, round)).toThrow(reason);
  });
});
