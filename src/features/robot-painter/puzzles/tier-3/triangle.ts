import { draft as d } from '../../engine/program.ts';
import { definePuzzle } from '../../engine/puzzle.ts';
import { turns, type ToolboxItem } from '../../engine/toolbox.ts';
import { buildProgram } from '../../engine/validate.ts';

const FORWARD: ToolboxItem = { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

/** A turn of 120 closes a triangle in three sides. */
export default definePuzzle({
  id: 'triangle',
  tier: 'tier-3',
  order: 2,
  kind: 'build',
  canvas: { width: 24, height: 15 },
  start: { x: 9, y: 12, heading: 90 },
  toolbox: [FORWARD, ...turns([60, 90, 120]), { kind: 'repeat' }],
  blockLimit: 40,
  solution: buildProgram([d.repeat(3, [d.forward(6), d.turnLeft(120)])]),
});
