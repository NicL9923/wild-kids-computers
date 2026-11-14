import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, colors, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Fix a pen block inside a longer repeat. The pen stays up, so only one of three windows appears. */
export default definePuzzle({
  id: 'fixTheWindows',
  tier: 'tier-2',
  order: 10,
  kind: 'fix',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 1 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 24,
  solution: buildProgram([
    d.repeat(3, [d.right(), d.down(), d.left(), d.up(), d.penUp(), d.right(), d.right(), d.penDown()]),
  ]),
  startingProgram: buildProgram([
    d.repeat(3, [d.right(), d.down(), d.left(), d.up(), d.penUp(), d.right(), d.right(), d.penUp()]),
  ]),
});
