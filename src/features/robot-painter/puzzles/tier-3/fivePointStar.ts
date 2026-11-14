import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** A turn wider than a corner, 144, makes the points of a star. */
export default definePuzzle({
  id: 'fivePointStar',
  tier: 'tier-3',
  order: 4,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 8, y: 6, heading: 90 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }],
  blockLimit: 40,
  solution: buildProgram([d.repeat(5, [d.forward(8), d.turnRight(144)])]),
});
