import type { Puzzle } from './engine/puzzle.ts';

/**
 * The level of a robot painter tier's step: the puzzle itself. Each tier activity lists its
 * puzzle modules in order, and the kit asks for one by index.
 */
export function puzzleAt(steps: readonly Puzzle[], stepIndex: number): Puzzle {
  const puzzle = Number.isInteger(stepIndex) ? steps[stepIndex] : undefined;
  if (puzzle === undefined) {
    throw new RangeError(`No puzzle at step ${String(stepIndex)}; the tier has ${String(steps.length)}.`);
  }
  return puzzle;
}
