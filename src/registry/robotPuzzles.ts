import { TIERS, type Puzzle, type Tier } from '../features/robot-painter/engine/puzzle.ts';

/**
 * The robot painter puzzles. Each puzzle is found by its file name,
 * src/features/robot-painter/puzzles/<tier>/<puzzleId>.ts, so adding one never edits this file.
 */

/** Module paths by puzzle, for the puzzle tests. */
export const robotPuzzleModules = import.meta.glob<{ default: Puzzle }>(
  ['../features/robot-painter/puzzles/*/*.ts', '!../features/robot-painter/puzzles/**/*.test.ts'],
  { eager: true },
);

/** Every puzzle, tier by tier, each tier easiest first. */
export const robotPuzzles: readonly Puzzle[] = Object.values(robotPuzzleModules)
  .map((module) => module.default)
  .toSorted((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.order - b.order);

/** One tier's puzzles in order. These are the steps of that tier's sequence activity. */
export function puzzlesForTier(tier: Tier): Puzzle[] {
  return robotPuzzles.filter((puzzle) => puzzle.tier === tier);
}
