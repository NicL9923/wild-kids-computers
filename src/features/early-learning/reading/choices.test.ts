import { describe, expect, it } from 'vitest';
import { createRandom } from '../../../core/activityKit/random.ts';
import { chooseWithAnswer, type ChoiceRules } from './choices.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 977 + 3);

/** Numbers 1 to 9: 2 and 3 clash (both right), and numbers next to each other are easy to confuse. */
const rules = (total: number, similar: number): ChoiceRules<number> => ({
  pool: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  total,
  clashes: (a, b) => a !== b && [a, b].every((n) => n === 2 || n === 3),
  confusable: (answer, other) => Math.abs(answer - other) === 1,
  similar,
});

describe('chooseWithAnswer', () => {
  it('offers the answer once, the total asked for, and no two that clash', () => {
    for (const seed of SEEDS) {
      const choices = chooseWithAnswer(createRandom(seed), 5, rules(5, 0));
      expect(choices).toHaveLength(5);
      expect(choices.filter((n) => n === 5)).toHaveLength(1);
      expect(new Set(choices).size).toBe(5);
      expect(choices.includes(2) && choices.includes(3)).toBe(false);
    }
  });

  it('never offers a choice that clashes with the answer', () => {
    for (const seed of SEEDS) expect(chooseWithAnswer(createRandom(seed), 2, rules(6, 0))).not.toContain(3);
  });

  it('keeps easy-to-confuse choices out when similar is 0', () => {
    for (const seed of SEEDS) {
      const choices = chooseWithAnswer(createRandom(seed), 5, rules(5, 0));
      expect(choices).not.toContain(4);
      expect(choices).not.toContain(6);
    }
  });

  it.each([1, 2])('offers exactly %i easy-to-confuse choices when asked', (similar) => {
    for (const seed of SEEDS) {
      const choices = chooseWithAnswer(createRandom(seed), 5, rules(4, similar));
      expect(choices.filter((n) => n === 4 || n === 6)).toHaveLength(similar);
    }
  });

  it('fills with other choices when there are fewer easy-to-confuse ones than asked', () => {
    for (const seed of SEEDS) {
      // 9 has one neighbor, 8.
      const choices = chooseWithAnswer(createRandom(seed), 9, rules(4, 2));
      expect(choices).toHaveLength(4);
      expect(choices).toContain(8);
    }
  });

  it('puts the answer in every position', () => {
    const positions = new Set(SEEDS.map((seed) => chooseWithAnswer(createRandom(seed), 5, rules(4, 1)).indexOf(5)));
    expect([...positions].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('rejects a round the pool cannot fill, naming the answer and the count', () => {
    expect(() => chooseWithAnswer(createRandom(1), 5, { ...rules(5, 0), pool: [4, 5, 6, 7] })).toThrow(
      'Only 2 fair choices for 5, not 5.',
    );
  });
});
