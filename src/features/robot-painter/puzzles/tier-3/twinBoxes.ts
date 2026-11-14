import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

const TWIN_BOXES_MAIN = [
  d.call('box'),
  d.penUp(),
  d.turnRight(90),
  d.forward(6),
  d.turnLeft(90),
  d.penDown(),
  d.call('box'),
];

/** Teach the robot a new block. The program already calls "box" twice, and the box is empty. */
export default definePuzzle({
  id: 'twinBoxes',
  tier: 'tier-3',
  order: 7,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 6, y: 10 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors(), { kind: 'define' }],
  blockLimit: 40,
  solution: buildProgram(TWIN_BOXES_MAIN, [d.define('box', [d.repeat(4, [d.forward(3), d.turnRight(90)])])]),
  startingProgram: buildProgram(TWIN_BOXES_MAIN, [d.define('box', [])]),
});
