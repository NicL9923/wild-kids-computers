import { describe, expect, it } from 'vitest';
import {
  assertDifficultyRange,
  clampDifficulty,
  CLEAN_ROUNDS_TO_RAISE,
  nextDifficulty,
  startingDifficulty,
  STRUGGLE_THRESHOLD,
} from './difficulty.ts';

const RANGE = { min: 2, max: 6 };
const clean = (level: number) => ({ mistakes: 0, hintsUsed: 0, level });
const round = (level: number, mistakes: number, hintsUsed = 0) => ({ mistakes, hintsUsed, level });

describe('the model constants', () => {
  it('raise after two clean rounds and lower at three mistakes and hints', () => {
    // These two numbers are the model's feel: a raise needs a short run of clean play, and a
    // round with three slips is enough to ease off. Changing them changes every activity.
    expect([CLEAN_ROUNDS_TO_RAISE, STRUGGLE_THRESHOLD]).toEqual([2, 3]);
  });
});

describe('nextDifficulty', () => {
  it('keeps the level with no rounds yet', () => {
    expect(nextDifficulty(4, [], RANGE)).toBe(4);
  });

  it('raises by one after two clean rounds at the current level', () => {
    expect(nextDifficulty(3, [clean(3), clean(3)], RANGE)).toBe(4);
  });

  it('keeps the level after only one clean round', () => {
    expect(nextDifficulty(3, [clean(3)], RANGE)).toBe(3);
  });

  it('does not count clean rounds from a lower level toward a raise', () => {
    // Just raised from 3 to 4: one clean round at 4 is not enough to go to 5.
    expect(nextDifficulty(4, [clean(3), clean(3), clean(4)], RANGE)).toBe(4);
  });

  it('does not count a clean round without a saved level toward a raise', () => {
    expect(nextDifficulty(3, [{ mistakes: 0, hintsUsed: 0 }, clean(3)], RANGE)).toBe(3);
  });

  it.each([
    ['one mistake', round(3, 1)],
    ['one hint', round(3, 0, 1)],
  ])('keeps the level when the last round had %s', (_label, last) => {
    expect(nextDifficulty(3, [clean(3), last], RANGE)).toBe(3);
  });

  it('keeps the level when an earlier round in the run had a slip', () => {
    expect(nextDifficulty(3, [round(3, 1), clean(3)], RANGE)).toBe(3);
  });

  it.each([
    ['two mistakes and no hints, just under the threshold', 2, 0, 4],
    ['three mistakes', 3, 0, 3],
    ['two mistakes and one hint', 2, 1, 3],
    ['three hints', 0, 3, 3],
    ['many mistakes', 12, 0, 3],
  ])('after %s at level 4 goes to %s', (_label, mistakes, hints, expected) => {
    expect(nextDifficulty(4, [clean(4), round(4, mistakes, hints)], RANGE)).toBe(expected);
  });

  it('lowers by only one step even after a very hard round', () => {
    expect(nextDifficulty(6, [round(6, 30, 5)], RANGE)).toBe(5);
  });

  it('never goes above the top of the range', () => {
    expect(nextDifficulty(6, [clean(6), clean(6)], RANGE)).toBe(6);
    expect(nextDifficulty(5, [clean(5), clean(5)], RANGE)).toBe(6);
  });

  it('never goes below the bottom of the range', () => {
    expect(nextDifficulty(2, [round(2, 5)], RANGE)).toBe(2);
    expect(nextDifficulty(3, [round(3, 5)], RANGE)).toBe(2);
  });

  it('brings a level outside the range back in first, such as after a band change', () => {
    expect(nextDifficulty(9, [round(9, 1)], RANGE)).toBe(6);
    expect(nextDifficulty(1, [round(1, 1)], RANGE)).toBe(2);
  });

  it('climbs one step at a time through a long run of clean rounds', () => {
    const history: ReturnType<typeof clean>[] = [];
    let level = 2;
    const levels = [level];
    for (let i = 0; i < 10; i += 1) {
      history.push(clean(level));
      level = nextDifficulty(level, history, RANGE);
      levels.push(level);
    }
    expect(levels).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6]);
  });
});

describe('startingDifficulty', () => {
  it('starts a new activity at the bottom of the range', () => {
    expect(startingDifficulty(undefined, RANGE)).toBe(2);
    expect(startingDifficulty({ recentRounds: [], daysPracticed: [] }, RANGE)).toBe(2);
  });

  it('resumes at the saved level', () => {
    expect(startingDifficulty({ difficulty: 5, recentRounds: [], daysPracticed: [] }, RANGE)).toBe(5);
  });

  it('clamps a saved level from another band into this range', () => {
    expect(startingDifficulty({ difficulty: 9, recentRounds: [], daysPracticed: [] }, RANGE)).toBe(6);
  });
});

describe('clampDifficulty', () => {
  it.each([
    [1, 2],
    [2, 2],
    [6, 6],
    [7, 6],
    [4.6, 5],
    [Number.NaN, 2],
  ])('brings %s to %s', (level, expected) => {
    expect(clampDifficulty(level, RANGE)).toBe(expected);
  });
});

describe('assertDifficultyRange', () => {
  it.each([[{ min: 1, max: 1 }], [{ min: 1, max: 10 }], [{ min: 10, max: 10 }]])('accepts %j', (range) => {
    expect(() => assertDifficultyRange(range)).not.toThrow();
  });

  it.each([
    [{ min: 0, max: 5 }, /must stay within 1 to 10, not 0 to 5/],
    [{ min: 1, max: 11 }, /must stay within 1 to 10, not 1 to 11/],
    [{ min: 5, max: 4 }, /min above max: 5 to 4/],
    [{ min: 1.5, max: 4 }, /whole numbers/],
    [{ min: 1, max: 4.5 }, /whole numbers/],
  ])('rejects %j', (range, reason) => {
    expect(() => assertDifficultyRange(range, 'band-3-5')).toThrow(reason);
  });

  it('names where the bad range came from', () => {
    expect(() => assertDifficultyRange({ min: 3, max: 2 }, 'pop-the-seed-pods band-3-5')).toThrow(
      /^pop-the-seed-pods band-3-5 has min above max/,
    );
  });

  it('is checked by every function that takes a range', () => {
    const bad = { min: 4, max: 3 };
    expect(() => clampDifficulty(3, bad)).toThrow(/min above max/);
    expect(() => nextDifficulty(3, [], bad)).toThrow(/min above max/);
    expect(() => startingDifficulty(undefined, bad)).toThrow(/min above max/);
  });
});
