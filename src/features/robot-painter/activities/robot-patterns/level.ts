import type { Puzzle } from '../../engine/puzzle.ts';
import bigStairs from '../../puzzles/tier-2/bigStairs.ts';
import longLine from '../../puzzles/tier-2/longLine.ts';
import repeatStairs from '../../puzzles/tier-2/repeatStairs.ts';
import fixTheSlide from '../../puzzles/tier-2/fixTheSlide.ts';
import dashedLine from '../../puzzles/tier-2/dashedLine.ts';
import twoColorBox from '../../puzzles/tier-2/twoColorBox.ts';
import fixTheCandyStripe from '../../puzzles/tier-2/fixTheCandyStripe.ts';
import castleWall from '../../puzzles/tier-2/castleWall.ts';
import threeStripes from '../../puzzles/tier-2/threeStripes.ts';
import fixTheWindows from '../../puzzles/tier-2/fixTheWindows.ts';
import { puzzleAt } from '../../puzzleLevel.ts';

/** The tier-2 puzzles, easiest first. Each one is a step of this activity. */
export const steps: readonly Puzzle[] = [
  bigStairs,
  longLine,
  repeatStairs,
  fixTheSlide,
  dashedLine,
  twoColorBox,
  fixTheCandyStripe,
  castleWall,
  threeStripes,
  fixTheWindows,
];

/** The puzzle of a step. The seed and band change nothing: every child meets the same puzzles. */
export function generateLevel(_seed: number, stepIndex: number): Puzzle {
  return puzzleAt(steps, stepIndex);
}
