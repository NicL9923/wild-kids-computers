import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** A repeat can hold two blocks, and repeats them together. */
export default definePuzzle({
  id: 'repeatStairs',
  tier: 'tier-2',
  order: 3,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 5 },
  toolbox: [...arrows(), { kind: 'repeat' }],
  blockLimit: 24,
  solution: buildProgram([d.repeat(4, [d.up(), d.right()])]),
});
