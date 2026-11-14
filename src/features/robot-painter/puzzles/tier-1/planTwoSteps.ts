import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** The first plan: put two arrows in a row, then press go. */
export default definePuzzle({
  id: 'planTwoSteps',
  tier: 'tier-1',
  order: 5,
  kind: 'build',
  canvas: { width: 5, height: 3 },
  start: { x: 1, y: 2 },
  toolbox: arrows('right', 'down'),
  blockLimit: 4,
  solution: buildProgram([d.right(), d.right()]),
  mustEndAtFinish: true,
});
