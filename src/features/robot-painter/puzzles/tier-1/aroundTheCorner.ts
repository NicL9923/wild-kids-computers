import { draft as d } from '../../engine/program.ts';
import { DIRECT_PRESS_LIMIT, definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** The way turns a corner, so the child changes arrows partway. */
export default definePuzzle({
  id: 'aroundTheCorner',
  tier: 'tier-1',
  order: 4,
  kind: 'direct',
  canvas: { width: 5, height: 3 },
  start: { x: 0, y: 1 },
  toolbox: arrows(),
  blockLimit: DIRECT_PRESS_LIMIT,
  solution: buildProgram([d.right(), d.right(), d.down()]),
});
