import { describe, expect, it } from 'vitest';
import activity from './activity.ts';
import {
  canMove,
  DIRECTIONS,
  generateLevel,
  keyOf,
  MAX_DIFFICULTY,
  neighbor,
  OPEN,
  straightRun,
  waysFrom,
  type Cell,
  type MazeLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 4_513 + 17);

/** Open sides between two cells: each wall is shared, so both cells must agree. */
function problems(level: MazeLevel): string[] {
  const found: string[] = [];
  const { columns, rows, cells } = level;
  if (cells.length !== rows || cells.some((row) => row.length !== columns)) found.push('the grid has the wrong shape');
  let openings = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      for (const direction of DIRECTIONS) {
        const to = neighbor({ x, y }, direction, columns, rows);
        const open = canMove(cells, { x, y }, direction);
        if (to === null) {
          if (open) found.push(`${keyOf({ x, y })} opens off the board`);
          continue;
        }
        const back = DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % 4];
        if (back !== undefined && open !== canMove(cells, to, back))
          found.push(`${keyOf({ x, y })} ${direction} disagrees`);
        if (open) openings += 1;
      }
    }
  }
  // A perfect maze: every cell reached, and one fewer passage than cells, so no loops.
  const reached = waysFrom(cells, level.start);
  if (reached.size !== columns * rows) found.push(`only ${String(reached.size)} cells can be reached`);
  if (openings / 2 !== columns * rows - 1) found.push(`${String(openings / 2)} passages, so the maze has loops`);
  // The path walks from start to goal through open sides.
  let at: Cell = level.start;
  for (const direction of level.path) {
    const to = neighbor(at, direction, columns, rows);
    if (to === null || !canMove(cells, at, direction)) {
      found.push('the path goes through a wall');
      break;
    }
    at = to;
  }
  if (keyOf(at) !== keyOf(level.goal)) found.push('the path does not end at the snack');
  // The snack is as far as any cell, so the walk is never trivial.
  const longest = Math.max(...[...reached.values()].map((way) => way.length));
  if (level.path.length !== longest) found.push('the snack is not in the farthest cell');
  const corners = [
    [0, 0],
    [columns - 1, 0],
    [0, rows - 1],
    [columns - 1, rows - 1],
  ].map(([x = 0, y = 0]) => keyOf({ x, y }));
  if (!corners.includes(keyOf(level.start))) found.push('the animal does not start in a corner');
  return found;
}

/** Cells with exactly one open side, other than the start and the snack. */
function deadEnds(level: MazeLevel): number {
  let count = 0;
  level.cells.forEach((row, y) =>
    row.forEach((open, x) => {
      const sides = Object.values(OPEN).filter((bit) => (open & bit) !== 0).length;
      const key = keyOf({ x, y });
      if (sides === 1 && key !== keyOf(level.start) && key !== keyOf(level.goal)) count += 1;
    }),
  );
  return count;
}

/** Dead ends per maze at a difficulty, on average over the seeds. */
const average = (difficulty: number) =>
  SEEDS.reduce((sum, seed) => sum + deadEnds(generateLevel(seed, difficulty, 'band-6-8')), 0) / SEEDS.length;

describe('generateLevel', () => {
  // The design: maze size per difficulty.
  it.each([
    [1, 3, 2],
    [2, 4, 3],
    [3, 5, 3],
    [4, 5, 4],
    [5, 6, 4],
    [6, 7, 5],
    [7, 8, 5],
    [8, 9, 6],
    [9, 11, 7],
    [10, 13, 8],
  ])('at difficulty %i makes a %i by %i perfect maze for every seed', (difficulty, columns, rows) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect([level.columns, level.rows]).toEqual([columns, rows]);
    }
  });

  it("stays solvable at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('mazes is a rounds activity');
    for (const band of activity.bands) {
      const range = activity.difficulty[band];
      if (range === undefined) throw new Error(`No range for ${band}`);
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS.slice(0, 50)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('branches more once the walk jumps back, so harder mazes have more dead ends', () => {
    // Same size, with and without jumping back.
    const winding = average(3);
    expect(average(4)).toBeGreaterThan(winding);
    // The biggest maze has many places to go wrong.
    expect(average(MAX_DIFFICULTY)).toBeGreaterThan(15);
  });

  it('starts in every corner over many rounds', () => {
    const starts = new Set(SEEDS.map((seed) => keyOf(generateLevel(seed, 5, 'band-6-8').start)));
    expect([...starts].toSorted((a, b) => a.localeCompare(b))).toEqual(['0,0', '0,3', '5,0', '5,3']);
  });

  it.each([0, MAX_DIFFICULTY + 1, 2.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('straightRun', () => {
  // A 3 by 1 corridor open all the way, and a wall after the second cell in a copy.
  const open = { columns: 3, rows: 1, cells: [[OPEN.right, OPEN.left | OPEN.right, OPEN.left]] };
  const walled = { columns: 3, rows: 1, cells: [[OPEN.right, OPEN.left, 0]] };

  it('walks every cell up to a cell in a straight open line', () => {
    expect(straightRun(open, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(straightRun(open, { x: 2, y: 0 }, { x: 0, y: 0 })).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('stops at the snack on the way', () => {
    expect(straightRun(open, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 })).toEqual([{ x: 1, y: 0 }]);
  });

  it.each([
    ['through a wall', walled, { x: 2, y: 0 }],
    ['to the cell it is in', open, { x: 0, y: 0 }],
    [
      'off the straight line',
      {
        columns: 2,
        rows: 2,
        cells: [
          [OPEN.right | OPEN.down, OPEN.left],
          [OPEN.up, 0],
        ],
      },
      { x: 1, y: 1 },
    ],
  ])('refuses a move %s', (_, level, to) => {
    expect(straightRun(level, { x: 0, y: 0 }, to)).toBeNull();
  });

  it('moves up and down too', () => {
    const column = { columns: 1, rows: 2, cells: [[OPEN.down], [OPEN.up]] };
    expect(straightRun(column, { x: 0, y: 0 }, { x: 0, y: 1 })).toEqual([{ x: 0, y: 1 }]);
    expect(straightRun(column, { x: 0, y: 1 }, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }]);
  });
});
