import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** Nested repeats with a turn between copies spin eight squares into a flower. */
export default definePuzzle({
  id: 'squareFlower',
  tier: 'tier-3',
  order: 6,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 12, y: 7 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 40,
  solution: buildProgram([
    d.color('purple'),
    d.repeat(8, [d.repeat(4, [d.forward(4), d.turnRight(90)]), d.turnRight(45)]),
  ]),
});
