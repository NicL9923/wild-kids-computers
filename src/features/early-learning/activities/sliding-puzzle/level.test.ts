import { beforeAll, describe, expect, it } from 'vitest';
import activity from './activity.ts';
import {
  distanceHome,
  generateLevel,
  isSolved,
  MAX_DIFFICULTY,
  neighborsOf,
  slide,
  solvedBoard,
  TILE,
  type Board,
  type SlidingLevel,
} from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 8_191 + 19);

const keyOf = (board: Board) => board.map((tile) => (tile === null ? '_' : String(tile))).join(',');

/**
 * The fewest slides from the finished board to every board it can reach, by breadth-first
 * search. Written apart from the generator: it swaps the space with each neighbor directly.
 */
function distancesFromSolved(columns: number, rows: number): Map<string, number> {
  const start = solvedBoard(columns, rows);
  const distances = new Map([[keyOf(start), 0]]);
  const queue: Board[] = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const board = queue[head] ?? start;
    const space = board.indexOf(null);
    const here = distances.get(keyOf(board)) ?? 0;
    const x = space % columns;
    const y = Math.floor(space / columns);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      if (x + dx < 0 || x + dx >= columns || y + dy < 0 || y + dy >= rows) continue;
      const other = space + dx + dy * columns;
      const next = [...board];
      next[space] = board[other] ?? null;
      next[other] = null;
      const key = keyOf(next);
      if (distances.has(key)) continue;
      distances.set(key, here + 1);
      queue.push(next);
    }
  }
  return distances;
}

const tables = new Map<string, Map<string, number>>();

beforeAll(() => {
  for (const [columns, rows] of [
    [2, 2],
    [3, 2],
    [3, 3],
  ] as const) {
    tables.set(`${String(columns)}x${String(rows)}`, distancesFromSolved(columns, rows));
  }
});

/** Whether a 4 by 4 board can be solved: the classic parity of inversions and the space's row. */
function solvable4x4(board: Board): boolean {
  const tiles = board.filter((tile): tile is number => tile !== null);
  let inversions = 0;
  for (let i = 0; i < tiles.length; i += 1)
    for (let j = i + 1; j < tiles.length; j += 1) if ((tiles[i] ?? 0) > (tiles[j] ?? 0)) inversions += 1;
  const rowFromBottom = 4 - Math.floor(board.indexOf(null) / 4);
  return (inversions + rowFromBottom) % 2 === 1;
}

function problems(level: SlidingLevel): string[] {
  const found: string[] = [];
  const { columns, rows, board } = level;
  const tiles = board.filter((tile) => tile !== null);
  if (board.length !== columns * rows) found.push('the board has the wrong size');
  if (board.filter((tile) => tile === null).length !== 1) found.push('not one space');
  if (new Set(tiles).size !== tiles.length || tiles.some((tile) => tile < 0 || tile >= columns * rows - 1))
    found.push('tiles repeat or are missing');
  if (isSolved(board)) found.push('the board starts finished');
  if (level.scene.width !== columns * TILE || level.scene.height !== rows * TILE)
    found.push('the picture does not fit the board');
  if (level.scene.pictures.length !== columns * rows) found.push('a tile has no picture of its own');
  return found;
}

/** The fewest slides to finish, from the table, or null when the board cannot be finished. */
function fewestSlides(level: SlidingLevel): number | null {
  return tables.get(`${String(level.columns)}x${String(level.rows)}`)?.get(keyOf(level.board)) ?? null;
}

describe('generateLevel', () => {
  // The design: board size, and the fewest and most slides a child needs, per difficulty.
  it.each([
    [1, 2, 2, 1, 1],
    [2, 2, 2, 2, 2],
    [3, 2, 2, 3, 4],
    [4, 3, 2, 3, 5],
    [5, 3, 2, 5, 8],
    [6, 3, 3, 6, 8],
    [7, 3, 3, 8, 12],
    [8, 3, 3, 10, 18],
    [9, 3, 3, 12, 30],
  ])(
    'at difficulty %i gives a %i by %i board that takes %i to %i slides, for every seed',
    (difficulty, columns, rows, fewest, most) => {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect([level.columns, level.rows]).toEqual([columns, rows]);
        const slides = fewestSlides(level);
        expect(slides, `seed ${String(seed)}`).not.toBeNull();
        expect(slides).toBeGreaterThanOrEqual(fewest);
        expect(slides).toBeLessThanOrEqual(most);
      }
    },
  );

  it('gives a 4 by 4 board that can be finished and is at least 16 steps from finished, at difficulty 10', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, MAX_DIFFICULTY, 'band-9-12');
      expect(problems(level), `seed ${String(seed)}`).toEqual([]);
      expect([level.columns, level.rows]).toEqual([4, 4]);
      expect(solvable4x4(level.board)).toBe(true);
      expect(distanceHome(level.board, 4)).toBeGreaterThanOrEqual(16);
    }
  });

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('sliding-puzzle is a rounds activity');
    for (const band of activity.bands) {
      const range = activity.difficulty[band];
      if (range === undefined) throw new Error(`No range for ${band}`);
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS.slice(0, 50)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('slides either tile next to the space first, over many rounds', () => {
    // On the easiest board one slide moves tile 1 or tile 2 into the corner.
    const moved = new Set(SEEDS.map((seed) => generateLevel(seed, 1, 'band-3-5').board.indexOf(null)));
    expect([...moved].toSorted((a, b) => a - b)).toEqual([1, 2]);
  });

  it.each([0, MAX_DIFFICULTY + 1, 1.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('the sliding rules', () => {
  it('slides a tile next to the space into it, and refuses one that is not', () => {
    const board: Board = [0, 1, 2, null];
    expect(slide(board, 2, 2, 2)).toEqual([0, 1, null, 2]);
    expect(slide(board, 1, 2, 2)).toEqual([0, null, 2, 1]);
    expect(slide(board, 0, 2, 2)).toBeNull();
    expect(slide(board, 3, 2, 2)).toBeNull();
  });

  it('finds neighbors only on the board, never across a row end', () => {
    expect(neighborsOf(0, 3, 2).toSorted((a, b) => a - b)).toEqual([1, 3]);
    expect(neighborsOf(2, 3, 2).toSorted((a, b) => a - b)).toEqual([1, 5]);
    expect(neighborsOf(3, 3, 2).toSorted((a, b) => a - b)).toEqual([0, 4]);
    expect(neighborsOf(4, 3, 3).toSorted((a, b) => a - b)).toEqual([1, 3, 5, 7]);
  });

  it('knows a finished board only with the space last', () => {
    expect(isSolved([0, 1, 2, null])).toBe(true);
    expect(isSolved([0, 1, null, 2])).toBe(false);
    expect(isSolved([null, 0, 1, 2])).toBe(false);
  });

  it('adds up the steps every tile needs, across rows and columns', () => {
    expect(distanceHome([0, 1, 2, null], 2)).toBe(0);
    expect(distanceHome([null, 1, 2, 0], 2)).toBe(2);
    expect(distanceHome([5, 1, 2, 3, 4, 0, 6, 7, null], 3)).toBe(6);
  });
});
