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
const SIZES: readonly (readonly [columns: number, rows: number])[] = [
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

const keyOf = (cell: Cell) => `${String(cell.x)},${String(cell.y)}`;

/** Grows a perfect maze from `start` by a depth-first walk that turns at random. */
function carve(random: Random, columns: number, rows: number, start: Cell): number[][] {
  // One flat list of cells, row by row, cut into rows at the end.
  const open = Array.from({ length: columns * rows }, () => 0);
  const seen = new Set([keyOf(start)]);
  const stack: Cell[] = [start];
  for (let cell = stack.at(-1); cell !== undefined; cell = stack.at(-1)) {
    const from = cell;
    const next = random
      .shuffle(DIRECTIONS)
      .map((direction) => ({ direction, to: neighbor(from, direction, columns, rows) }))
      .find(({ to }) => to !== null && !seen.has(keyOf(to)));
    if (next?.to == null) {
      stack.pop();
      continue;
    }
    const { direction, to } = next;
    const index = from.y * columns + from.x;
    open[index] = (open[index] ?? 0) | OPEN[direction];
    // The cell carved into is new, so its only open side is the way back.
    open[to.y * columns + to.x] = OPEN[OPPOSITE[direction]];
    seen.add(keyOf(to));
    stack.push(to);
  }
  return Array.from({ length: rows }, (_, row) => open.slice(row * columns, (row + 1) * columns));
}

/**
 * The way from `from` to every cell, by breadth-first search through open sides, in the order
 * the search reaches them. In a perfect maze each way is the only one.
 */
export function waysFrom(cells: MazeLevel['cells'], from: Cell): Map<string, Direction[]> {
  // Equivalent to cells[0].length: every row of a maze has the same length.
  const columns = cells[0]?.length ?? 0;
  const ways = new Map<string, Direction[]>([[keyOf(from), []]]);
  // A for...of over an array that grows visits the cells added while it runs.
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
export function farthest(ways: ReadonlyMap<string, readonly Direction[]>): { cell: Cell; way: readonly Direction[] } {
  let best: { cell: Cell; way: readonly Direction[] } | null = null;
  for (const [key, way] of ways) {
    if (best !== null && way.length <= best.way.length) continue;
    const [x = 0, y = 0] = key.split(',').map(Number);
    best = { cell: { x, y }, way };
  }
  if (best === null) throw new RangeError('A maze has at least one cell.');
  return best;
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
  const { cell: goal, way: path } = farthest(waysFrom(cells, start));
  const [critter, snack] = random.pick(PAIRS);
  return { columns, rows, cells, start, goal, path, critter, snack };
}
