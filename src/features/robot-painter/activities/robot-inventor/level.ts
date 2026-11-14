import type { Puzzle } from '../../engine/puzzle.ts';
import turtleSquare from '../../puzzles/tier-3/turtleSquare.ts';
import triangle from '../../puzzles/tier-3/triangle.ts';
import hexagon from '../../puzzles/tier-3/hexagon.ts';
import fivePointStar from '../../puzzles/tier-3/fivePointStar.ts';
import rowOfSquares from '../../puzzles/tier-3/rowOfSquares.ts';
import squareFlower from '../../puzzles/tier-3/squareFlower.ts';
import twinBoxes from '../../puzzles/tier-3/twinBoxes.ts';
import twoHouses from '../../puzzles/tier-3/twoHouses.ts';
import petalFlower from '../../puzzles/tier-3/petalFlower.ts';
import flowerGarden from '../../puzzles/tier-3/flowerGarden.ts';
import { puzzleAt } from '../../puzzleLevel.ts';

/** The tier-3 puzzles, easiest first. Each one is a step of this activity. */
export const steps: readonly Puzzle[] = [
  turtleSquare,
  triangle,
  hexagon,
  fivePointStar,
  rowOfSquares,
  squareFlower,
  twinBoxes,
  twoHouses,
  petalFlower,
  flowerGarden,
];

/** The puzzle of a step. The seed and band change nothing: every child meets the same puzzles. */
export function generateLevel(_seed: number, stepIndex: number): Puzzle {
  return puzzleAt(steps, stepIndex);
}
