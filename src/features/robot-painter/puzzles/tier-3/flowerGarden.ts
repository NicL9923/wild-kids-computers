import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** A block that calls another block: a flower made of petals, planted twice. */
export default definePuzzle({
  id: 'flowerGarden',
  tier: 'tier-3',
  order: 10,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 6, y: 5 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors(), { kind: 'define' }],
  blockLimit: 40,
  solution: buildProgram(
    [
      d.color('red'),
      d.call('flower'),
      d.color('green'),
      d.turnRight(180),
      d.forward(9),
      d.penUp(),
      d.turnLeft(90),
      d.forward(12),
      d.turnLeft(90),
      d.forward(9),
      d.penDown(),
      d.color('purple'),
      d.call('flower'),
      d.color('green'),
      d.turnRight(180),
      d.forward(9),
    ],
    [
      d.define('petal', [d.repeat(2, [d.forward(2), d.turnRight(30), d.forward(2), d.turnRight(150)])]),
      d.define('flower', [d.repeat(8, [d.call('petal'), d.turnRight(45)])]),
    ],
  ),
});
