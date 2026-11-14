import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** Call your own block inside a repeat: one petal, eight times around. */
export default definePuzzle({
  id: 'petalFlower',
  tier: 'tier-3',
  order: 9,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 12, y: 7 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors(), { kind: 'define' }],
  blockLimit: 40,
  solution: buildProgram(
    [d.color('red'), d.repeat(8, [d.call('petal'), d.turnRight(45)]), d.color('green'), d.turnRight(180), d.forward(7)],
    [d.define('petal', [d.repeat(2, [d.forward(3), d.turnRight(30), d.forward(3), d.turnRight(150)])])],
  ),
});
