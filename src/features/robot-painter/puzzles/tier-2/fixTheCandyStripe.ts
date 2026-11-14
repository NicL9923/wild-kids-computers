import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, colors, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Fix a color: one color block inside a repeat is the wrong color. */
export default definePuzzle({
  id: 'fixTheCandyStripe',
  tier: 'tier-2',
  order: 7,
  kind: 'fix',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 2 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors('red', 'blue', 'green')],
  blockLimit: 24,
  solution: buildProgram([d.repeat(3, [d.color('red'), d.right(), d.color('blue'), d.right()])]),
  startingProgram: buildProgram([d.repeat(3, [d.color('red'), d.right(), d.color('green'), d.right()])]),
});
