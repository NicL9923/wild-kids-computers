import { draft as d } from '../../engine/program.ts';
import { DIRECT_PRESS_LIMIT, definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** An arrow press moves the robot one step and draws its trail. */
export default definePuzzle({
  id: 'firstStep',
  tier: 'tier-1',
  order: 1,
  kind: 'direct',
  canvas: { width: 5, height: 3 },
  start: { x: 1, y: 2 },
  toolbox: arrows('right'),
  blockLimit: DIRECT_PRESS_LIMIT,
  solution: buildProgram([d.right()]),
});
