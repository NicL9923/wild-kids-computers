import type { Band } from '../../../../core/bands.ts';
import { createRandom, type Random } from '../../../../core/activityKit/random.ts';
import { makeScene, type Scene } from '../../logic/scene.ts';

/**
 * Sliding puzzle: a picture cut into square tiles with one space empty. A tile next to the space
 * slides into it. The child slides the tiles until the picture is whole again.
 *
 * Every arrangement is made by sliding tiles away from the finished picture, so it can always be
 * slid back. Difficulty grows the board and the number of slides, a little at a time, and the
 * scramble must be far enough from finished that the child has something to do.
 */

/** Scene units per tile. */
export const TILE = 400;

interface Tier {
  readonly columns: number;
  readonly rows: number;
  /** Random slides away from the finished picture. */
  readonly slides: number;
  /**
   * The least total distance the tiles must travel home, counted in tile steps. Every slide moves
   * one tile one step, so this is the least number of slides the child needs.
   */
  readonly away: number;
}

/** One entry per difficulty, 1 first. */
const TIERS: readonly Tier[] = [
  { columns: 2, rows: 2, slides: 1, away: 1 },
  { columns: 2, rows: 2, slides: 2, away: 2 },
  { columns: 2, rows: 2, slides: 4, away: 3 },
  { columns: 3, rows: 2, slides: 5, away: 3 },
  { columns: 3, rows: 2, slides: 8, away: 5 },
  { columns: 3, rows: 3, slides: 8, away: 6 },
  { columns: 3, rows: 3, slides: 12, away: 8 },
  { columns: 3, rows: 3, slides: 18, away: 10 },
  { columns: 3, rows: 3, slides: 30, away: 12 },
  { columns: 4, rows: 4, slides: 40, away: 16 },
];

export const MAX_DIFFICULTY = TIERS.length;

/**
 * The board, row by row. Each entry is the home index of the tile there, counted row by row from
 * 0, or null for the space. The finished board is 0, 1, 2, ... with the space last.
 */
export type Board = readonly (number | null)[];

export interface SlidingLevel {
  readonly columns: number;
  readonly rows: number;
  readonly board: Board;
  readonly scene: Scene;
}

function tierFor(difficulty: number): Tier {
  const tier = TIERS[difficulty - 1];
  if (!Number.isInteger(difficulty) || tier === undefined) {
    throw new RangeError(`Sliding puzzle has difficulty 1 to ${String(MAX_DIFFICULTY)}, not ${String(difficulty)}.`);
  }
  return tier;
}

export function solvedBoard(columns: number, rows: number): (number | null)[] {
  return Array.from({ length: columns * rows }, (_, index) => (index === columns * rows - 1 ? null : index));
}

export function isSolved(board: Board): boolean {
  return board.every((tile, index) => (index === board.length - 1 ? tile === null : tile === index));
}

/** The places next to `index`, the ones a tile there could slide to. */
export function neighborsOf(index: number, columns: number, rows: number): number[] {
  const x = index % columns;
  const y = Math.floor(index / columns);
  const around: number[] = [];
  if (y > 0) around.push(index - columns);
  if (x < columns - 1) around.push(index + 1);
  if (y < rows - 1) around.push(index + columns);
  if (x > 0) around.push(index - 1);
  return around;
}

/** The board after the tile at `index` slides into the space, or null when it is not next to the space. */
export function slide(board: Board, index: number, columns: number, rows: number): Board | null {
  const space = board.indexOf(null);
  if (board[index] == null || !neighborsOf(index, columns, rows).includes(space)) return null;
  const next = [...board];
  next[space] = board[index] ?? null;
  next[index] = null;
  return next;
}

/** Steps every tile needs to reach home, added up. No sequence of slides can be shorter. */
export function distanceHome(board: Board, columns: number): number {
  let total = 0;
  board.forEach((tile, index) => {
    if (tile === null) return;
    total +=
      Math.abs((tile % columns) - (index % columns)) +
      Math.abs(Math.floor(tile / columns) - Math.floor(index / columns));
  });
  return total;
}

/** Slides tiles from the finished board at random, never straight back, `count` times. */
function scramble(random: Random, columns: number, rows: number, count: number): Board {
  let board: Board = solvedBoard(columns, rows);
  let previous = -1;
  for (let step = 0; step < count; step += 1) {
    const space = board.indexOf(null);
    const choices = neighborsOf(space, columns, rows).filter((index) => index !== previous);
    const moving = random.pick(choices);
    board = slide(board, moving, columns, rows) ?? board;
    previous = space;
  }
  return board;
}

/** Scrambles before giving up on one far enough from finished. */
const ATTEMPTS = 60;

/** Pure: the same seed and difficulty give the same board and picture. The band does not change it. */
export function generateLevel(seed: number, difficulty: number, _band: Band): SlidingLevel {
  const { columns, rows, slides, away } = tierFor(difficulty);
  const random = createRandom(seed);
  const scene = makeScene(random, columns * TILE, rows * TILE, columns, rows);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const board = scramble(random, columns, rows, slides);
    if (distanceHome(board, columns) >= away) return { columns, rows, board, scene };
  }
  throw new Error(`No sliding puzzle ${String(away)} steps from finished for seed ${String(seed)}.`);
}
