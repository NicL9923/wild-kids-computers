import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** Six sides need a turn of 60: the turns add up to one whole turn. */
export default definePuzzle({
  id: 'hexagon',
  tier: 'tier-3',
  order: 3,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 10, y: 12, heading: 90 },
  toolbox: [FORWARD, ...turns([45, 60, 72, 90, 120]), { kind: 'repeat' }],
  blockLimit: 40,
  solution: buildProgram([d.repeat(6, [d.forward(3), d.turnLeft(60)])]),
});
