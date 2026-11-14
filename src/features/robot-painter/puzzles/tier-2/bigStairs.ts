import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** A longer program of six arrows draws big stairs. */
export default definePuzzle({
  id: 'bigStairs',
  tier: 'tier-2',
  order: 1,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 5 },
  toolbox: arrows(),
  blockLimit: 24,
  solution: buildProgram([d.up(), d.right(), d.up(), d.right(), d.up(), d.right()]),
});
