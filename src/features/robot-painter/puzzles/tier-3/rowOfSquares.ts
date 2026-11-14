import { draft as d, TURN_ANGLES } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { colors, pen, turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** A repeat inside a repeat: one square, four times along a row. */
export default definePuzzle({
  id: 'rowOfSquares',
  tier: 'tier-3',
  order: 5,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 6, y: 10 },
  toolbox: [FORWARD, ...turns(TURN_ANGLES), { kind: 'repeat' }, ...pen(), ...colors()],
  blockLimit: 40,
  solution: buildProgram([
    d.repeat(4, [d.repeat(4, [d.forward(3), d.turnRight(90)]), d.turnRight(90), d.forward(3), d.turnLeft(90)]),
  ]),
});
