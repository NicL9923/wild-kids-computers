import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import { PICTURE_SETS, type Picture } from '../../logic/pictures.ts';

/**
 * Picture sudoku: a small grid where each picture goes once in every row and every column, and
 * on the 4 by 4 grid once in every 2 by 2 box too. Some squares are empty.
 *
 * Every empty square can be filled by looking only at what is already there: at each step some
 * empty square has just one picture left that its row, column, and box do not already hold.
 * That makes the solution the only one, which the level test checks again with a full solver.
 */

type Grid = readonly (readonly number[])[];

interface Tier {
  readonly size: 3 | 4;
  readonly blanks: number;
}

/** One entry per difficulty, 1 first. Each step empties one or two more squares. */
const TIERS: readonly Tier[] = [
  { size: 3, blanks: 1 },
  { size: 3, blanks: 2 },
  { size: 3, blanks: 3 },
  { size: 3, blanks: 4 },
  { size: 3, blanks: 5 },
  { size: 4, blanks: 4 },
  { size: 4, blanks: 6 },
  { size: 4, blanks: 8 },
  { size: 4, blanks: 9 },
  { size: 4, blanks: 10 },
];

export const MAX_DIFFICULTY = TIERS.length;

export interface SudokuLevel {
  readonly size: 3 | 4;
  /** True when the grid has 2 by 2 boxes, which the 4 by 4 grid does. */
  readonly boxes: boolean;
  /** The picture each number stands for. */
  readonly pictures: readonly Picture[];
  /** The full grid, row by row, as picture numbers. */
  readonly solution: Grid;
  /** The squares that start empty, as [row, column], in reading order. */
  readonly blanks: readonly (readonly [number, number])[];
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Picture sudoku has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

/** The number in a square, or null when it is empty. */
type Puzzle = (number | null)[][];

/** The squares that share a row, a column, or (with boxes) a 2 by 2 box with [row, column]. */
export function peersOf(size: number, boxes: boolean, row: number, column: number): [number, number][] {
  const peers: [number, number][] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (r === row && c === column) continue;
      const sameBox =
        boxes && Math.floor(r / 2) === Math.floor(row / 2) && Math.floor(c / 2) === Math.floor(column / 2);
      if (r === row || c === column || sameBox) peers.push([r, c]);
    }
  }
  return peers;
}

/** The numbers an empty square can still take. */
export function candidates(
  puzzle: readonly (readonly (number | null)[])[],
  boxes: boolean,
  row: number,
  column: number,
): number[] {
  const size = puzzle.length;
  const used = new Set(peersOf(size, boxes, row, column).map(([r, c]) => puzzle[r]?.[c] ?? null));
  return Array.from({ length: size }, (_, value) => value).filter((value) => !used.has(value));
}

/**
 * Fills squares that have only one picture left until none is empty. Returns false when it gets
 * stuck, which means the puzzle needs harder reasoning than looking at a row, column, and box.
 */
export function solvesBySingles(start: readonly (readonly (number | null)[])[], boxes: boolean): boolean {
  const puzzle: Puzzle = start.map((row) => [...row]);
  for (;;) {
    let empty = 0;
    let progressed = false;
    puzzle.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value !== null) return;
        empty += 1;
        const left = candidates(puzzle, boxes, r, c);
        if (left.length === 1) {
          row[c] = left[0] ?? null;
          progressed = true;
        }
      }),
    );
    if (empty === 0) return true;
    if (!progressed) return false;
  }
}

/**
 * A full grid: the cyclic pattern with its rows, columns, and pictures shuffled. On the 4 by 4
 * grid rows move only within their pair and pairs move together, and the same for columns, so
 * every box still holds each picture once.
 */
function solutionGrid(random: Random, size: 3 | 4): number[][] {
  const base = (r: number, c: number) => (size === 3 ? (r + c) % 3 : (2 * (r % 2) + Math.floor(r / 2) + c) % 4);
  const order = (): number[] =>
    size === 3
      ? random.shuffle([0, 1, 2])
      : random.shuffle([0, 1]).flatMap((pair) => random.shuffle([0, 1]).map((within) => pair * 2 + within));
  const rows = order();
  const columns = order();
  const symbols = random.shuffle(Array.from({ length: size }, (_, index) => index));
  return rows.map((r) => columns.map((c) => symbols[base(r, c)] ?? 0));
}

/** Pure: the same seed and difficulty give the same puzzle. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SudokuLevel {
  const tier = tierFor(difficulty);
  const boxes = tier.size === 4;
  const random = createRandom(seed);
  const pictures = random.sample(PICTURE_SETS.animals, tier.size);
  const solution = solutionGrid(random, tier.size);
  const squares = solution.flatMap((row, r) => row.map((_, c) => [r, c] as const));
  // One pass over the squares in random order, emptying each one that leaves the puzzle solvable
  // by looking. Over 20,000 seeds at every difficulty a pass always reached the tier's count.
  const puzzle: Puzzle = solution.map((row) => [...row]);
  const blanks: (readonly [number, number])[] = [];
  for (const [r, c] of random.shuffle(squares)) {
    if (blanks.length === tier.blanks) break;
    const row = puzzle[r];
    if (row === undefined) continue;
    row[c] = null;
    if (solvesBySingles(puzzle, boxes)) blanks.push([r, c]);
    else row[c] = solution[r]?.[c] ?? null;
  }
  if (blanks.length === tier.blanks) {
    const inReadingOrder = blanks.toSorted(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2);
    return { size: tier.size, boxes, pictures, solution, blanks: inReadingOrder };
  }
  throw new Error(`No puzzle with ${String(tier.blanks)} empty squares for seed ${String(seed)}.`);
}
