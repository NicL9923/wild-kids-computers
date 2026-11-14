import { describe, expect, it } from 'vitest';
import { puzzlesForTier } from '../../../../registry/robotPuzzles.ts';
import activity from './activity.ts';
import { generateLevel, steps } from './level.ts';

describe('robot-patterns', () => {
  it('lists every tier-2 puzzle, easiest first', () => {
    expect(steps.map((puzzle) => puzzle.id)).toEqual(puzzlesForTier('tier-2').map((puzzle) => puzzle.id));
  });

  it('gives each step its own puzzle, the same for every seed and band', () => {
    steps.forEach((puzzle, index) => {
      for (const band of activity.bands) expect(generateLevel(index * 7919, index, band)).toBe(puzzle);
    });
  });

  it.each([-1, steps.length, 1.5])('refuses step %s, which the tier does not have', (step) => {
    expect(() => generateLevel(1, step)).toThrow(
      `No puzzle at step ${String(step)}; the tier has ${String(steps.length)}.`,
    );
  });
});
