import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows, colors, pen } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** A repeat of a four-arrow pattern builds a castle wall. */
export default definePuzzle({
  id: 'castleWall',
  tier: 'tier-2',
  order: 8,
  kind: 'build',
  canvas: { width: 8, height: 5 },
  start: { x: 1, y: 4 },
  toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 24,
  solution: buildProgram([d.repeat(3, [d.up(), d.right(), d.down(), d.right()])]),
});
