import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, colors, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** A color block changes the pen color, so the box has a red half and a blue half. */
export default definePuzzle({
  id: 'twoColorBox',
  tier: 'tier-2',
  order: 6,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 3, y: 1 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors('red', 'blue', 'green')],
  blockLimit: 24,
  solution: buildProgram([
    d.color('red'),
    d.right(),
    d.right(),
    d.down(),
    d.down(),
    d.color('blue'),
    d.left(),
    d.left(),
    d.up(),
    d.up(),
  ]),
});
