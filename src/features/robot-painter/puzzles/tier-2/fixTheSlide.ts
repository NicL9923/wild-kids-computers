import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** The first fix: one arrow in the program points the wrong way. */
export default definePuzzle({
  id: 'fixTheSlide',
  tier: 'tier-2',
  order: 4,
  kind: 'fix',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 1 },
  toolbox: [...arrows(), { kind: 'repeat' }],
  blockLimit: 24,
  solution: buildProgram([d.right(), d.down(), d.right(), d.down(), d.right(), d.down()]),
  startingProgram: buildProgram([d.right(), d.down(), d.right(), d.up(), d.right(), d.down()]),
});
