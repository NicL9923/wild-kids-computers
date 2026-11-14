import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import activity from './activity.ts';
import {
  canMove,
  farthest,
  DIRECTIONS,
  generateLevel,
  MAX_MAZE_DIFFICULTY,
  neighbor,
  OPEN,
  PAIRS,
  waysFrom,
  type Cell,
  type MazeLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 300 }, (_, index) => index * 7919 + 3);
const DIFFICULTIES = Array.from({ length: MAX_MAZE_DIFFICULTY }, (_, index) => index + 1);

/** Every rule that makes a maze fair, checked from the cells alone. */
function problems(level: MazeLevel): string[] {
  const found: string[] = [];
  const { columns, rows, cells } = level;
  if (cells.length !== rows || cells.some((row) => row.length !== columns)) found.push('the grid has the wrong shape');
  let passages = 0;
  cells.forEach((row, y) =>
    row.forEach((open, x) => {
      for (const direction of DIRECTIONS) {
        if ((open & OPEN[direction]) === 0) continue;
        const to = neighbor({ x, y }, direction, columns, rows);
        if (to === null) found.push(`${String(x)},${String(y)} opens ${direction} off the board`);
        else if (!canMove(cells, to, ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[direction])) {
          found.push(`${String(x)},${String(y)} opens ${direction} into a wall`);
        } else passages += 1;
      }
    }),
  );
  // A perfect maze is a tree: every cell reachable, and one fewer passage than cells.
  const ways = waysFrom(cells, level.start);
  if (ways.size !== columns * rows) found.push(`only ${String(ways.size)} cells are reachable`);
  if (passages / 2 !== columns * rows - 1) found.push(`${String(passages / 2)} passages, so a loop or a gap`);
  const corners = [0, columns - 1].flatMap((x) => [0, rows - 1].map((y) => `${String(x)},${String(y)}`));
  if (!corners.includes(`${String(level.start.x)},${String(level.start.y)}`)) found.push('the start is not a corner');
  // Walking the path from the start through open sides ends on the goal.
  let at: Cell = level.start;
  for (const step of level.path) {
    const to = neighbor(at, step, columns, rows);
    if (to === null || !canMove(cells, at, step)) {
      found.push(`the path walks ${step} through a wall`);
      break;
    }
    at = to;
  }
  if (at.x !== level.goal.x || at.y !== level.goal.y) found.push('the path does not end at the goal');
  const longest = Math.max(...[...ways.values()].map((way) => way.length));
  if (level.path.length !== longest) found.push('the snack is not in the farthest cell');
  if (level.path.length < columns + rows - 2) found.push('the snack is too close');
  if (!PAIRS.some(([critter, snack]) => critter === level.critter && snack === level.snack)) {
    found.push('the critter and snack do not belong together');
  }
  return found;
}

describe('generateLevel', () => {
  it.each(DIFFICULTIES)('at difficulty %i makes a fair perfect maze for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-6-8');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('grows by one row or one column per difficulty, from a straight hall to a 7 by 4 maze', () => {
    expect(
      DIFFICULTIES.map((difficulty) => {
        const { columns, rows } = generateLevel(5, difficulty, 'band-6-8');
        return `${String(columns)}x${String(rows)}`;
      }),
    ).toEqual(['4x1', '3x2', '4x2', '4x3', '5x3', '6x3', '6x4', '7x4']);
  });

  it('starts the youngest band on a straight hall with three steps', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const level = generateLevel(seed, 1, 'band-3-5');
      expect(level.path).toHaveLength(3);
      expect(new Set(level.path).size).toBe(1);
    }
  });

  it.each(
    activity.bands.flatMap((band: Band) => {
      const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
      return range === undefined
        ? []
        : ([
            [band, range.min],
            [band, range.max],
          ] as const);
    }),
  )('gives %s at difficulty %i mazes that differ from seed to seed', (band, difficulty) => {
    const shapes = new Set(SEEDS.slice(0, 60).map((seed) => JSON.stringify(generateLevel(seed, difficulty, band))));
    expect(shapes.size).toBeGreaterThan(difficulty === 1 ? 8 : 40);
    for (const seed of SEEDS.slice(0, 60)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
  });

  it('keeps the youngest band to small mazes with big cells', () => {
    const range = activity.kind === 'rounds' ? activity.difficulty['band-3-5'] : undefined;
    const level = generateLevel(1, range?.max ?? 0, 'band-3-5');
    expect(level.columns * level.rows).toBeLessThanOrEqual(12);
  });

  it.each([0, MAX_MAZE_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 8, not/);
  });
});

describe('canMove', () => {
  const cells = [
    [OPEN.right, OPEN.left | OPEN.down],
    [0, OPEN.up],
  ];
  it.each([
    ['through an open side', { x: 0, y: 0 }, 'right', true],
    ['into a wall', { x: 0, y: 0 }, 'down', false],
    ['from a cell off the grid', { x: 5, y: 5 }, 'up', false],
  ] as const)('moves %s: %s', (_label, from, direction, expected) => {
    expect(canMove(cells, from, direction)).toBe(expected);
  });
});

describe('neighbor', () => {
  it.each([
    ['up', { x: 1, y: 0 }],
    ['right', { x: 2, y: 1 }],
    ['down', { x: 1, y: 2 }],
    ['left', { x: 0, y: 1 }],
  ] as const)('goes %s to the cell on that side', (direction, expected) => {
    expect(neighbor({ x: 1, y: 1 }, direction, 3, 3)).toEqual(expected);
  });

  it.each([
    ['up', { x: 0, y: 0 }],
    ['left', { x: 0, y: 0 }],
    ['right', { x: 2, y: 0 }],
    ['down', { x: 0, y: 2 }],
  ] as const)('gives nothing past the %s edge', (direction, from) => {
    expect(neighbor(from, direction, 3, 3)).toBeNull();
  });
});

describe('waysFrom and farthest', () => {
  // A hall of three cells, left to right, with a side cell below the middle one.
  const cells = [
    [OPEN.right, OPEN.left | OPEN.right | OPEN.down, OPEN.left],
    [0, OPEN.up, 0],
  ];

  it('gives the start an empty way and every reachable cell its one way, nearest first', () => {
    expect([...waysFrom(cells, { x: 0, y: 0 })]).toEqual([
      ['0,0', []],
      ['1,0', ['right']],
      ['2,0', ['right', 'right']],
      ['1,1', ['right', 'down']],
    ]);
  });

  it('picks the longest way, and the first one reached when two are as long', () => {
    expect(farthest(waysFrom(cells, { x: 0, y: 0 }))).toEqual({ cell: { x: 2, y: 0 }, way: ['right', 'right'] });
    expect(farthest(new Map([['4,4', []]]))).toEqual({ cell: { x: 4, y: 4 }, way: [] });
  });

  it('rejects a maze with no cells', () => {
    expect(() => farthest(new Map())).toThrow('A maze has at least one cell.');
  });
});
