import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../core/activityKit/random.ts';
import { nearby, pickChoices } from './choices.ts';

describe('nearby', () => {
  it('lists the numbers within the spread, leaving out the answer and anything out of range', () => {
    expect(nearby(5, 2, 0, 100)).toEqual([3, 4, 6, 7]);
    expect(nearby(1, 2, 1, 100)).toEqual([2, 3]);
    expect(nearby(99, 2, 0, 100)).toEqual([97, 98, 100]);
  });
});

describe('pickChoices', () => {
  it('offers the answer once among distinct choices, smallest first', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const choices = pickChoices(createRandom(seed), 6, 4, [6, 5, 7, 5], [8, 9, 6]);
      expect(choices.filter((choice) => choice === 6)).toHaveLength(1);
      expect(new Set(choices).size).toBe(4);
      expect(choices).toEqual(choices.toSorted((a, b) => a - b));
    }
  });

  it('takes the first pool before the next', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(pickChoices(createRandom(seed), 10, 3, [9, 11], [1, 2, 3])).toEqual([9, 10, 11]);
      expect(pickChoices(createRandom(seed), 10, 4, [9], [11, 9], [1])).toEqual([1, 9, 10, 11]);
    }
  });

  it('fills from the next pool when the first runs out', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 50; seed += 1) {
      const choices = pickChoices(createRandom(seed), 10, 3, [9], [1, 2]);
      expect(choices).toContain(9);
      for (const choice of choices) seen.add(choice);
    }
    expect([...seen].toSorted((a, b) => a - b)).toEqual([1, 2, 9, 10]);
  });

  it('refuses a row it cannot fill, naming the count', () => {
    expect(() => pickChoices(createRandom(1), 3, 4, [2, 3, 2], [3, 4, 2])).toThrow(
      '4 choices for 3 need 3 other numbers, found 2.',
    );
  });
});
