import type { Band } from '../../../../core/bands.ts';
import { createRandom } from '../../../../core/activityKit/random.ts';
import { PICTURES, type MirrorPicture } from './pictures.ts';

/**
 * Mirror symmetry: one half of a picture on a grid, a mirror line, and an empty half. The child
 * fills the squares that make the empty half a mirror of the other. Difficulty grows the grid
 * from 4 squares across to 10, then gives the right half instead of the left, then turns the
 * mirror line to lie flat.
 */

export type Axis = 'vertical' | 'horizontal';
/** Which half the child sees filled: the left or top, or the right or bottom. */
export type Given = 'first' | 'second';
export type GridSize = 4 | 6 | 8 | 10;

interface Tier {
  readonly size: GridSize;
  readonly axes: readonly Axis[];
  readonly given: readonly Given[];
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { size: 4, axes: ['vertical'], given: ['first'] },
  { size: 4, axes: ['vertical'], given: ['first', 'second'] },
  { size: 6, axes: ['vertical'], given: ['first'] },
  { size: 6, axes: ['vertical'], given: ['first', 'second'] },
  { size: 8, axes: ['vertical'], given: ['first', 'second'] },
  { size: 8, axes: ['vertical', 'horizontal'], given: ['first', 'second'] },
  { size: 10, axes: ['vertical'], given: ['first', 'second'] },
  { size: 10, axes: ['vertical', 'horizontal'], given: ['first', 'second'] },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface MirrorLevel {
  readonly name: string;
  readonly paint: MirrorPicture['paint'];
  readonly size: GridSize;
  readonly axis: Axis;
  readonly given: Given;
  /** The whole picture, rows top to bottom, `#` filled. */
  readonly rows: readonly string[];
}

export interface Cell {
  readonly row: number;
  readonly column: number;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Mirror symmetry has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** Rows become columns, so a picture that mirrors left to right mirrors top to bottom. */
export function transpose(rows: readonly string[]): string[] {
  return Array.from({ length: rows[0]?.length ?? 0 }, (_, column) => rows.map((row) => row[column] ?? '.').join(''));
}

/** Whether a square is in the half the child fills. */
export function inChildHalf(level: Pick<MirrorLevel, 'size' | 'axis' | 'given'>, cell: Cell): boolean {
  const along = level.axis === 'vertical' ? cell.column : cell.row;
  const inFirst = along < level.size / 2;
  return level.given === 'first' ? !inFirst : inFirst;
}

/** Whether the picture fills a square. */
export function isFilled(level: Pick<MirrorLevel, 'rows'>, cell: Cell): boolean {
  return level.rows[cell.row]?.[cell.column] === '#';
}

/** The squares the child must fill, top to bottom and left to right. */
export function cellsToFill(level: MirrorLevel): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const cell = { row, column };
      if (inChildHalf(level, cell) && isFilled(level, cell)) cells.push(cell);
    }
  }
  return cells;
}

/** Pure: the same seed and difficulty give the same round in every band. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MirrorLevel {
  const tier = tierFor(difficulty);
  const random = createRandom(seed);
  const picture = random.pick(PICTURES[tier.size]);
  const axis = random.pick(tier.axes);
  const given = random.pick(tier.given);
  const rows = axis === 'vertical' ? picture.rows : transpose(picture.rows);
  return { name: picture.name, paint: picture.paint, size: tier.size, axis, given, rows };
}
