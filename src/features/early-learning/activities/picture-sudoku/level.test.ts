import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import activity from './activity.ts';
import { candidates, generateLevel, MAX_DIFFICULTY, peersOf, solvesBySingles, type SudokuLevel } from './level.ts';

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 2_791 + 13);

type Cells = (number | null)[][];

/** The puzzle the child sees: the solution with its blanks emptied. */
function puzzleOf(level: SudokuLevel): Cells {
  const puzzle: Cells = level.solution.map((row) => [...row]);
  for (const [r, c] of level.blanks) {
    const row = puzzle[r];
    if (row !== undefined) row[c] = null;
  }
  return puzzle;
}

/**
 * Counts solutions by trying every picture in every empty square, up to `limit`. Written apart
 * from the generator's rules: it checks rows, columns, and boxes directly.
 */
function countSolutions(puzzle: Cells, boxes: boolean, limit = 2): number {
  const size = puzzle.length;
  const fits = (r: number, c: number, value: number) => {
    for (let i = 0; i < size; i += 1) {
      if (puzzle[r]?.[i] === value || puzzle[i]?.[c] === value) return false;
    }
    if (!boxes) return true;
    const top = r - (r % 2);
    const left = c - (c % 2);
    for (let dr = 0; dr < 2; dr += 1)
      for (let dc = 0; dc < 2; dc += 1) if (puzzle[top + dr]?.[left + dc] === value) return false;
    return true;
  };
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const row = puzzle[r];
      if (row === undefined || row[c] !== null) continue;
      let found = 0;
      for (let value = 0; value < size && found < limit; value += 1) {
        if (!fits(r, c, value)) continue;
        row[c] = value;
        found += countSolutions(puzzle, boxes, limit - found);
        row[c] = null;
      }
      return found;
    }
  }
  return 1;
}

/** Whether a full grid holds each picture once per row, column, and box. */
function isValidGrid(grid: readonly (readonly number[])[], boxes: boolean): boolean {
  const size = grid.length;
  const groups: number[][] = [];
  for (let i = 0; i < size; i += 1) {
    groups.push([...(grid[i] ?? [])]);
    groups.push(grid.map((row) => row[i] ?? -1));
  }
  if (boxes) {
    for (const top of [0, 2])
      for (const left of [0, 2])
        groups.push([0, 1, 2, 3].map((k) => grid[top + Math.floor(k / 2)]?.[left + (k % 2)] ?? -1));
  }
  return groups.every(
    (group) => group.length === size && new Set(group).size === size && group.every((v) => v >= 0 && v < size),
  );
}

function problems(level: SudokuLevel): string[] {
  const found: string[] = [];
  if (!isValidGrid(level.solution, level.boxes)) found.push('the solution breaks a rule');
  if (new Set(level.pictures).size !== level.size) found.push('pictures repeat');
  if (new Set(level.blanks.map(([r, c]) => `${String(r)},${String(c)}`)).size !== level.blanks.length)
    found.push('a blank repeats');
  const solutions = countSolutions(puzzleOf(level), level.boxes);
  if (solutions !== 1) found.push(`${String(solutions)} solutions`);
  if (!solvesBySingles(puzzleOf(level), level.boxes)) found.push('needs more than a look at a row, column, and box');
  return found;
}

describe('generateLevel', () => {
  // The design: grid size and empty squares per difficulty.
  it.each([
    [1, 3, 1],
    [2, 3, 2],
    [3, 3, 3],
    [4, 3, 4],
    [5, 3, 5],
    [6, 4, 4],
    [7, 4, 6],
    [8, 4, 8],
    [9, 4, 9],
    [10, 4, 10],
  ])(
    'at difficulty %i gives a %i by %i grid with %i empty squares and one solution, for every seed',
    (difficulty, size, blanks) => {
      for (const seed of SEEDS) {
        const level = generateLevel(seed, difficulty, 'band-6-8');
        expect(problems(level), `seed ${String(seed)}`).toEqual([]);
        expect(level.size).toBe(size);
        expect(level.boxes).toBe(size === 4);
        expect(level.solution).toHaveLength(size);
        expect(level.blanks).toHaveLength(blanks);
      }
    },
  );

  it("stays fair at both ends of every band's range", () => {
    if (activity.kind !== 'rounds') throw new Error('picture-sudoku is a rounds activity');
    for (const [band, range] of Object.entries(activity.difficulty) as [Band, { min: number; max: number }][]) {
      for (const difficulty of [range.min, range.max]) {
        for (const seed of SEEDS.slice(0, 60)) expect(problems(generateLevel(seed, difficulty, band))).toEqual([]);
      }
    }
  });

  it('lists the empty squares in reading order, so Tab moves left to right, top to bottom', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const order = generateLevel(seed, 8, 'band-6-8').blanks.map(([r, c]) => r * 4 + c);
      expect(order).toEqual(order.toSorted((a, b) => a - b));
    }
  });

  it('empties every square of the grid over many rounds, and varies the full grid', () => {
    const emptied = new Set(
      SEEDS.flatMap((seed) => generateLevel(seed, 2, 'band-3-5').blanks.map(([r, c]) => `${String(r)},${String(c)}`)),
    );
    expect(emptied.size).toBe(9);
    const grids = new Set(SEEDS.map((seed) => JSON.stringify(generateLevel(seed, 6, 'band-6-8').solution)));
    expect(grids.size).toBeGreaterThan(50);
  });

  it.each([0, MAX_DIFFICULTY + 1, 3.5])('rejects difficulty %s', (difficulty) => {
    expect(() => generateLevel(1, difficulty, 'band-3-5')).toThrow(/difficulty 1 to 10, not/);
  });
});

describe('the solving rules', () => {
  it('finds the peers of a square in its row, its column, and its box', () => {
    const key = (cells: [number, number][]) => cells.map(([r, c]) => `${String(r)}${String(c)}`).toSorted();
    expect(key(peersOf(3, false, 1, 1))).toEqual(['01', '10', '12', '21']);
    expect(key(peersOf(4, true, 0, 0))).toEqual(['01', '02', '03', '10', '11', '20', '30']);
    expect(key(peersOf(4, true, 3, 2))).toEqual(['02', '12', '22', '23', '30', '31', '33']);
  });

  it('leaves only the picture the row, column, and box do not hold', () => {
    const puzzle = [
      [0, 1, null],
      [null, null, 0],
      [null, 0, null],
    ];
    expect(candidates(puzzle, false, 0, 2)).toEqual([2]);
    expect(candidates(puzzle, false, 1, 0)).toEqual([1, 2]);
  });

  it('gets stuck on a puzzle that needs a guess, and finishes one that does not', () => {
    // Four empty squares whose two pictures could swap: every one of them has two left.
    const stuck = [
      [null, null, 2, 3],
      [null, null, 3, 2],
      [2, 3, 0, 1],
      [3, 2, 1, 0],
    ];
    expect(solvesBySingles(stuck, false)).toBe(false);
    expect(countSolutions(stuck, false)).toBe(2);
    const easy = [
      [null, 1, 2],
      [1, 2, null],
      [2, 0, 1],
    ];
    expect(solvesBySingles(easy, false)).toBe(true);
  });
});
