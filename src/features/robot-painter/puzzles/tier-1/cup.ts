import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { arrows } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

/** Three arrows that go down, across, and back up draw a cup. */
export default definePuzzle({
  id: 'cup',
  tier: 'tier-1',
  order: 8,
  kind: 'build',
  canvas: { width: 5, height: 3 },
  start: { x: 2, y: 1 },
  toolbox: arrows(),
  blockLimit: 4,
  solution: buildProgram([d.down(), d.right(), d.up()]),
});
