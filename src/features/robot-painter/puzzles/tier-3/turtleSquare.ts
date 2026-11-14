import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** Forward and turn: the robot walks the way it faces, and a turn of 90 makes a corner. */
export default definePuzzle({
  id: 'turtleSquare',
  tier: 'tier-3',
  order: 1,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 10, y: 11 },
  toolbox: [FORWARD, ...turns([90]), { kind: 'repeat' }],
  blockLimit: 40,
  solution: buildProgram([d.repeat(4, [d.forward(4), d.turnRight(90)])]),
});
