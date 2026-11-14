import type { Band } from '../../../core/bands.ts';
import type { World } from './interpreter.ts';
import { MAX_PROGRAM_BLOCKS, TURN_ANGLES } from './program.ts';
import { arrows, colors, pen, turns, type ToolboxItem } from './toolbox.ts';

/**
 * Free mode has no goal. Each band gets a canvas, a start, and a toolbox. The youngest band
 * presses arrows that run at once, as in the first tier 1 puzzles. Older bands build programs.
 */
export interface FreeMode {
  readonly style: 'direct' | 'build';
  readonly world: World;
  readonly toolbox: readonly ToolboxItem[];
  readonly blockLimit: number;
}

export const FREE_MODES: Readonly<Record<Band, FreeMode>> = {
  'band-3-5': {
    style: 'direct',
    world: { canvas: { width: 8, height: 5 }, start: { x: 4, y: 2, heading: 0, penDown: true, color: 'blue' } },
    toolbox: [...arrows(), ...colors('blue', 'red', 'green', 'orange')],
    blockLimit: MAX_PROGRAM_BLOCKS,
  },
  'band-6-8': {
    style: 'build',
    world: { canvas: { width: 8, height: 5 }, start: { x: 0, y: 5, heading: 0, penDown: true, color: 'blue' } },
    toolbox: [...arrows(), { kind: 'repeat' }, ...pen(), ...colors()],
    blockLimit: 60,
  },
  'band-9-12': {
    style: 'build',
    world: { canvas: { width: 24, height: 15 }, start: { x: 12, y: 7, heading: 0, penDown: true, color: 'blue' } },
    toolbox: [
      { kind: 'forward', distances: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      ...turns(TURN_ANGLES),
      { kind: 'repeat' },
      ...pen(),
      ...colors(),
      { kind: 'define' },
    ],
    blockLimit: MAX_PROGRAM_BLOCKS,
  },
};
