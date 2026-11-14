import { draft as d } from '../../engine/program.ts';
import { DIRECT_PRESS_LIMIT, definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** All four arrows. The place is two steps away, so the child presses again. */
export default definePuzzle({
  id: 'keepGoing',
  tier: 'tier-1',
  order: 3,
  kind: 'direct',
  canvas: { width: 5, height: 3 },
  start: { x: 1, y: 3 },
  toolbox: arrows(),
  blockLimit: DIRECT_PRESS_LIMIT,
  solution: buildProgram([d.up(), d.up()]),
});
