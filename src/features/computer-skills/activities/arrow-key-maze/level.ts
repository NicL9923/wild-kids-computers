import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import type { EmojiId } from '../../../../core/strings/shared/emoji.ts';

/**
 * Arrow key maze: a grid of square cells with walls, a critter in a corner, and its snack in the
 * cell farthest away. The maze is a perfect maze, grown by a seeded depth-first walk, so every
 * cell connects to every other by exactly one path. The level is always solvable and the way to
 * the snack is never a choice between two equal routes.
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

/** The critter and the snack it walks to. */
export const PAIRS = [
  ['rabbit', 'carrot'],
  ['mouse', 'cheese'],
  ['monkey', 'banana'],
  ['dog', 'bone'],
  ['bee', 'sunflower'],
  ['bear', 'honey'],
  ['turtle', 'lettuce'],
  ['hedgehog', 'apple'],
] as const satisfies readonly (readonly [EmojiId, EmojiId])[];

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

/** Maze size per difficulty, 1 first. Each step adds a row or a column, never both. */
export const SIZES: readonly (readonly [columns: number, rows: number])[] = [
  [4, 1],
  [3, 2],
  [4, 2],
  [4, 3],
  [5, 3],
  [6, 3],
  [6, 4],
  [7, 4],
];

export const MAX_MAZE_DIFFICULTY = SIZES.length;

/** The pause after the critter reaches its snack, so the child sees it arrive. */
export const ARRIVE_PAUSE_MS = 900;

function sizeFor(difficulty: number): readonly [number, number] {
  const size = SIZES[difficulty - 1];
  if (!Number.isInteger(difficulty) || size === undefined) {
    throw new RangeError(
      `Arrow key maze has difficulty 1 to ${String(MAX_MAZE_DIFFICULTY)}, not ${String(difficulty)}.`,
    );
  }
  return size;
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

/** Grows a perfect maze from `start` by a depth-first walk that turns at random. */
export function carve(random: Random, columns: number, rows: number, start: Cell): number[][] {
  const cells = Array.from({ length: rows }, () => Array.from<number>({ length: columns }).fill(0));
  const seen = new Set([`${String(start.x)},${String(start.y)}`]);
  const stack: Cell[] = [start];
  while (stack.length > 0) {
    const cell = stack.at(-1);
    if (cell === undefined) break;
    const next = random
      .shuffle(DIRECTIONS)
      .map((direction) => ({ direction, to: neighbor(cell, direction, columns, rows) }))
      .find(({ to }) => to !== null && !seen.has(`${String(to.x)},${String(to.y)}`));
    if (next?.to == null) {
      stack.pop();
      continue;
    }
    const { direction, to } = next;
    const row = cells[cell.y];
    const toRow = cells[to.y];
    if (row === undefined || toRow === undefined) throw new RangeError('A carved cell left the maze.');
    row[cell.x] = (row[cell.x] ?? 0) | OPEN[direction];
    toRow[to.x] = (toRow[to.x] ?? 0) | OPEN[OPPOSITE[direction]];
    seen.add(`${String(to.x)},${String(to.y)}`);
    stack.push(to);
  }
  return cells;
}

/**
 * The way from `from` to every cell, by breadth-first search through open sides. In a perfect
 * maze each way is the only one.
 */
export function waysFrom(cells: MazeLevel['cells'], from: Cell): Map<string, Direction[]> {
  const rows = cells.length;
  const columns = cells[0]?.length ?? 0;
  const ways = new Map<string, Direction[]>([[`${String(from.x)},${String(from.y)}`, []]]);
  const queue: Cell[] = [from];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (cell === undefined) break;
    const way = ways.get(`${String(cell.x)},${String(cell.y)}`) ?? [];
    for (const direction of DIRECTIONS) {
      const to = neighbor(cell, direction, columns, rows);
      if (to === null || !canMove(cells, cell, direction)) continue;
      const key = `${String(to.x)},${String(to.y)}`;
      if (ways.has(key)) continue;
      ways.set(key, [...way, direction]);
      queue.push(to);
    }
  }
  return ways;
}

/** Pure: the same seed and difficulty give the same maze. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): MazeLevel {
  const [columns, rows] = sizeFor(difficulty);
  const random = createRandom(seed);
  const corners: Cell[] = [
    { x: 0, y: 0 },
    { x: columns - 1, y: 0 },
    { x: 0, y: rows - 1 },
    { x: columns - 1, y: rows - 1 },
  ];
  const start = random.pick(corners);
  const cells = carve(random, columns, rows, start);
  // The goal is the cell with the longest way; the nearest to the start in search order wins a tie.
  let goal = start;
  let path: Direction[] = [];
  for (const [key, way] of waysFrom(cells, start)) {
    if (way.length <= path.length) continue;
    const [x = 0, y = 0] = key.split(',').map(Number);
    goal = { x, y };
    path = way;
  }
  const [critter, snack] = random.pick(PAIRS);
  return { columns, rows, cells, start, goal, path, critter, snack };
}
