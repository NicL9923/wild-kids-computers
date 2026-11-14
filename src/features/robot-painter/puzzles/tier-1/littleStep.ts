import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Three arrows climb one step. */
export default definePuzzle({
  id: 'littleStep',
  tier: 'tier-1',
  order: 7,
  kind: 'build',
  canvas: { width: 5, height: 3 },
  start: { x: 1, y: 2 },
  toolbox: arrows(),
  blockLimit: 4,
  solution: buildProgram([d.right(), d.up(), d.right()]),
});
