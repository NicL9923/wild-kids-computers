import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** Define a house block and place both calls yourself. */
export default definePuzzle({
  id: 'twoHouses',
  tier: 'tier-3',
  order: 8,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 4, y: 12 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors(), { kind: 'define' }],
  blockLimit: 40,
  solution: buildProgram(
    [d.call('house'), d.penUp(), d.turnRight(90), d.forward(10), d.turnLeft(90), d.penDown(), d.call('house')],
    [
      d.define('house', [
        // The walls, then the roof, then back down to the bottom left corner facing up,
        // so the next house starts the same way.
        d.repeat(4, [d.forward(4), d.turnRight(90)]),
        d.forward(4),
        d.turnRight(30),
        d.forward(4),
        d.turnRight(120),
        d.forward(4),
        d.turnRight(30),
        d.forward(4),
        d.turnRight(90),
        d.forward(4),
        d.turnRight(90),
      ]),
    ],
  ),
  startingProgram: buildProgram([], [d.define('house', [])]),
});
