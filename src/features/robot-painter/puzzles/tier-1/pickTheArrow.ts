import { draft as d } from '../../engine/program.ts';
import { DIRECT_PRESS_LIMIT, definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Two arrows to choose from. The one that points at the place takes the robot there. */
export default definePuzzle({
  id: 'pickTheArrow',
  tier: 'tier-1',
  order: 2,
  kind: 'direct',
  canvas: { width: 5, height: 3 },
  start: { x: 2, y: 1 },
  toolbox: arrows('right', 'down'),
  blockLimit: DIRECT_PRESS_LIMIT,
  solution: buildProgram([d.down()]),
});
