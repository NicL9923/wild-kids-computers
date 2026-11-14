import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Pen up moves the robot without drawing, and pen down draws again. */
export default definePuzzle({
  id: 'dashedLine',
  tier: 'tier-2',
  order: 5,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 0, y: 2 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen()],
  blockLimit: 24,
  solution: buildProgram([d.repeat(4, [d.right(), d.penUp(), d.right(), d.penDown()])]),
});
