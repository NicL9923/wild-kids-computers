import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, colors, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Three colors and pen up together: three stripes, each in its own color. */
export default definePuzzle({
  id: 'threeStripes',
  tier: 'tier-2',
  order: 9,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 2, y: 1 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 24,
  solution: buildProgram([
    d.color('red'),
    d.repeat(4, [d.right()]),
    d.penUp(),
    d.down(),
    d.penDown(),
    d.color('green'),
    d.repeat(4, [d.left()]),
    d.penUp(),
    d.down(),
    d.penDown(),
    d.color('blue'),
    d.repeat(4, [d.right()]),
  ]),
});
