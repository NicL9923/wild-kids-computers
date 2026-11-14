import type { Puzzle } from '../../engine/puzzle.ts';
import firstStep from '../../puzzles/tier-1/firstStep.ts';
import pickTheArrow from '../../puzzles/tier-1/pickTheArrow.ts';
import keepGoing from '../../puzzles/tier-1/keepGoing.ts';
import aroundTheCorner from '../../puzzles/tier-1/aroundTheCorner.ts';
import planTwoSteps from '../../puzzles/tier-1/planTwoSteps.ts';
import upAndOver from '../../puzzles/tier-1/upAndOver.ts';
import littleStep from '../../puzzles/tier-1/littleStep.ts';
import cup from '../../puzzles/tier-1/cup.ts';
import stairs from '../../puzzles/tier-1/stairs.ts';
import box from '../../puzzles/tier-1/box.ts';
import { puzzleAt } from '../../puzzleLevel.ts';

/** The tier-1 puzzles, easiest first. Each one is a step of this activity. */
export const steps: readonly Puzzle[] = [
  firstStep,
  pickTheArrow,
  keepGoing,
  aroundTheCorner,
  planTwoSteps,
  upAndOver,
  littleStep,
  cup,
  stairs,
  box,
];

/** The puzzle of a step. The seed and band change nothing: every child meets the same puzzles. */
export function generateLevel(_seed: number, stepIndex: number): Puzzle {
  return puzzleAt(steps, stepIndex);
}
