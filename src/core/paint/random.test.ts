import { describe, expect, it } from 'vitest';
import { createRandom, hash2, mixSeed, valueNoise } from './random.ts';

describe('seeded randomness', () => {
  it('repeats the same sequence for the same seed and differs for another', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const c = createRandom(43);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    expect(c.next()).not.toBe(first[0]);
  });

  it('keeps next, int, and range inside their bounds', () => {
    const random = createRandom(7);
    for (let i = 0; i < 2000; i++) {
      const value = random.next();
      const whole = random.int(6);
      const ranged = random.range(-2, 3);
      expect(value >= 0 && value < 1).toBe(true);
      expect(Number.isInteger(whole) && whole >= 0 && whole < 6).toBe(true);
      expect(ranged >= -2 && ranged < 3).toBe(true);
    }
  });

  it('mixes each part of a seed, in order', () => {
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
    expect(mixSeed(1, 2)).not.toBe(mixSeed(1, 3));
    expect(mixSeed(1, 2)).toBe(mixSeed(1, 2));
  });

  it('gives texture values in [0, 1) that depend on position and seed', () => {
    for (let x = -20; x < 20; x++) {
      const value = valueNoise(x * 0.7, x * 1.3, 3, 5);
      expect(value >= 0 && value < 1).toBe(true);
    }
    expect(hash2(1, 2, 3)).not.toBe(hash2(2, 1, 3));
    expect(hash2(1, 2, 3)).not.toBe(hash2(1, 2, 4));
    // On a grid point, value noise is that point's hash.
    expect(valueNoise(6, 9, 3, 5)).toBe(hash2(2, 3, 5));
  });
});
