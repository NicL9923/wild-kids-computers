import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** A repeat block runs the block inside it many times. It starts with a repeat of two. */
export default definePuzzle({
  id: 'longLine',
  tier: 'tier-2',
  order: 2,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 2 },
  toolbox: [...arrows(), { kind: 'repeat' }],
  blockLimit: 24,
  solution: buildProgram([d.repeat(6, [d.right()])]),
  startingProgram: buildProgram([d.repeat(2, [d.right()])]),
});
