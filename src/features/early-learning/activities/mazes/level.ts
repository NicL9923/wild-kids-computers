import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Mazes: a grid of square cells with walls, an animal in a corner, and its snack in the cell
 * farthest away along the paths. Every maze is a perfect maze: every cell connects to every other
 * by exactly one way, so the snack can always be reached and there is one route to it.
 *
 * Small mazes grow by a winding walk that makes long corridors with few side turns. From the
 * middle of the range the walk often jumps back to an earlier cell, which makes more branches
 * and dead ends, so finding the way takes looking ahead.
 */

export type Direction = 'up' | 'right' | 'down' | 'left';

export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

/** One bit per open side of a cell. */
export const OPEN: Readonly<Record<Direction, number>> = { up: 1, right: 2, down: 4, left: 8 };

const STEP: Readonly<Record<Direction, readonly [dx: number, dy: number]>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: 'down', right: 'left', down: 'up', left: 'right' };

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** The animal and the snack it walks to. */
const PAIRS = [
  ['rabbit', 'carrot'],
  ['mouse', 'cheese'],
  ['monkey', 'banana'],
  ['dog', 'bone'],
  ['bee', 'sunflower'],
  ['bear', 'honey'],
  ['turtle', 'lettuce'],
  ['hedgehog', 'apple'],
  ['cat', 'fish'],
  ['bird', 'cherries'],
] as const satisfies readonly (readonly [EmojiId, EmojiId])[];

interface Tier {
  readonly columns: number;
  readonly rows: number;
  /** How often the walk jumps back to an earlier cell, from 0 (never) to 1 (always). */
  readonly branching: number;
}

/** One entry per difficulty, 1 first. Each step grows the maze by a row or a column or two. */
const TIERS: readonly Tier[] = [
  { columns: 3, rows: 2, branching: 0 },
  { columns: 4, rows: 3, branching: 0 },
  { columns: 5, rows: 3, branching: 0 },
  { columns: 5, rows: 4, branching: 0.3 },
  { columns: 6, rows: 4, branching: 0.5 },
  { columns: 7, rows: 5, branching: 0.5 },
  { columns: 8, rows: 5, branching: 0.5 },
  { columns: 9, rows: 6, branching: 0.5 },
  { columns: 11, rows: 7, branching: 0.5 },
  { columns: 13, rows: 8, branching: 0.5 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface MazeLevel {
  readonly columns: number;
  readonly rows: number;
  /** `cells[y][x]` holds the OPEN bits of that cell's open sides. */
  readonly cells: readonly (readonly number[])[];
  readonly start: Cell;
  readonly goal: Cell;
  /** The one way from start to goal. */
  readonly path: readonly Direction[];
  readonly critter: EmojiId;
  readonly snack: EmojiId;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Mazes has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The cell one step away, or null past the edge. */
export function neighbor(cell: Cell, direction: Direction, columns: number, rows: number): Cell | null {
  const [dx, dy] = STEP[direction];
  const x = cell.x + dx;
  const y = cell.y + dy;
  return x < 0 || y < 0 || x >= columns || y >= rows ? null : { x, y };
}

/** Whether a move from `cell` goes through an open side. */
export function canMove(cells: MazeLevel['cells'], cell: Cell, direction: Direction): boolean {
  return ((cells[cell.y]?.[cell.x] ?? 0) & OPEN[direction]) !== 0;
}

export const keyOf = (cell: Cell) => `${String(cell.x)},${String(cell.y)}`;

/**
 * Grows a perfect maze from `start`. Each step carves from the newest cell, or with chance
 * `branching` from a random earlier cell that still has uncarved neighbors.
 */
function carve(random: Random, columns: number, rows: number, start: Cell, branching: number): number[][] {
  const open = Array.from({ length: columns * rows }, () => 0);
  const seen = new Set([keyOf(start)]);
  const active: Cell[] = [start];
  while (active.length > 0) {
    const index = random.next() < branching ? random.int(0, active.length - 1) : active.length - 1;
    const from = active[index] ?? start;
    const next = random
      .shuffle(DIRECTIONS)
      .map((direction) => ({ direction, to: neighbor(from, direction, columns, rows) }))
      .find(({ to }) => to !== null && !seen.has(keyOf(to)));
    if (next?.to == null) {
      active.splice(index, 1);
      continue;
    }
    const { direction, to } = next;
    const at = from.y * columns + from.x;
    open[at] = (open[at] ?? 0) | OPEN[direction];
    // The cell carved into is new, so its only open side is the way back.
    open[to.y * columns + to.x] = OPEN[OPPOSITE[direction]];
    seen.add(keyOf(to));
    active.push(to);
  }
  return Array.from({ length: rows }, (_, row) => open.slice(row * columns, (row + 1) * columns));
}

/**
 * The way from `from` to every cell it reaches, by breadth-first search through open sides, in
 * the order the search reaches them. In a perfect maze each way is the only one.
 */
export function waysFrom(cells: MazeLevel['cells'], from: Cell): Map<string, Direction[]> {
  const columns = cells[0]?.length ?? 0;
  const ways = new Map<string, Direction[]>([[keyOf(from), []]]);
  const queue: { cell: Cell; way: Direction[] }[] = [{ cell: from, way: [] }];
  for (const { cell, way } of queue) {
    for (const direction of DIRECTIONS) {
      const to = neighbor(cell, direction, columns, cells.length);
      if (to === null || !canMove(cells, cell, direction) || ways.has(keyOf(to))) continue;
      ways.set(keyOf(to), [...way, direction]);
      queue.push({ cell: to, way: [...way, direction] });
    }
  }
  return ways;
}

/** The cell with the longest way. The first the search reached wins a tie. */
function farthest(ways: ReadonlyMap<string, readonly Direction[]>): { cell: Cell; way: readonly Direction[] } {
  let best: { cell: Cell; way: readonly Direction[] } = { cell: { x: 0, y: 0 }, way: [] };
  for (const [key, way] of ways) {
    if (way.length <= best.way.length) continue;
    const [x = 0, y = 0] = key.split(',').map(Number);
    best = { cell: { x, y }, way };
  }
  return best;
}

/**
 * The cells a straight move from `from` toward `to` passes through, ending at `to`, or null when
 * `to` is not in a straight open line from `from`. A move stops early at `stop`, such as the snack.
 */
export function straightRun(
  level: Pick<MazeLevel, 'cells' | 'columns' | 'rows'>,
  from: Cell,
  to: Cell,
  stop?: Cell,
): Cell[] | null {
  if (from.x !== to.x && from.y !== to.y) return null;
  if (from.x === to.x && from.y === to.y) return null;
  const direction: Direction = to.x > from.x ? 'right' : to.x < from.x ? 'left' : to.y > from.y ? 'down' : 'up';
  const run: Cell[] = [];
  let at = from;
  while (at.x !== to.x || at.y !== to.y) {
    const next = neighbor(at, direction, level.columns, level.rows);
    if (next === null || !canMove(level.cells, at, direction)) return null;
    run.push(next);
    at = next;
    if (stop !== undefined && at.x === stop.x && at.y === stop.y) break;
  }
  return run;
}

/** Pure: the same seed and difficulty give the same maze. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MazeLevel {
  const { columns, rows, branching } = tierFor(difficulty);
  const random = createRandom(seed);
  const corners: Cell[] = [
    { x: 0, y: 0 },
    { x: columns - 1, y: 0 },
    { x: 0, y: rows - 1 },
    { x: columns - 1, y: rows - 1 },
  ];
  const start = random.pick(corners);
  const cells = carve(random, columns, rows, start, branching);
  const { cell: goal, way: path } = farthest(waysFrom(cells, start));
  const [critter, snack] = random.pick(PAIRS);
  return { columns, rows, cells, start, goal, path, critter, snack };
}
