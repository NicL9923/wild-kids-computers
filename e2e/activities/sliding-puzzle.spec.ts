import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/sliding-puzzle/activity.ts';
import {
  generateLevel,
  isSolved,
  neighborsOf,
  slide,
  type Board,
  type SlidingLevel,
} from '../../src/features/early-learning/activities/sliding-puzzle/level.ts';
import { strings } from '../../src/features/early-learning/activities/sliding-puzzle/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { settle } from '../support/logic.ts';
import { expectTargetsFit, rangeOf } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** The places to click, in order, for the fewest slides home, by breadth-first search. */
function solution(level: SlidingLevel): number[] {
  const key = (board: Board) => board.join(',');
  const from = new Map<string, { board: Board; previous: string | null; moved: number }>([
    [key(level.board), { board: level.board, previous: null, moved: -1 }],
  ]);
  const queue: Board[] = [level.board];
  for (let head = 0; head < queue.length; head += 1) {
    const board = queue[head] ?? level.board;
    if (isSolved(board)) {
      const moves: number[] = [];
      for (let at = from.get(key(board)); at !== undefined && at.previous !== null; at = from.get(at.previous)) {
        moves.unshift(at.moved);
      }
      return moves;
    }
    for (const index of neighborsOf(board.indexOf(null), level.columns, level.rows)) {
      const next = slide(board, index, level.columns, level.rows);
      if (next === null || from.has(key(next))) continue;
      from.set(key(next), { board: next, previous: key(board), moved: index });
      queue.push(next);
    }
  }
  throw new Error('The board cannot be finished');
}

/** The arrow key that slides the tile at `index` into the space. */
function arrowFor(level: SlidingLevel, board: Board, index: number): string {
  const space = board.indexOf(null);
  if (index === space + 1) return 'ArrowLeft';
  if (index === space - 1) return 'ArrowRight';
  if (index === space + level.columns) return 'ArrowUp';
  return 'ArrowDown';
}

async function expectBoardShows(page: Page, board: Board): Promise<void> {
  for (const [index, tile] of board.entries()) {
    if (tile === null) continue;
    await expect(page.locator(`[data-tile="${String(tile)}"]`)).toHaveAttribute('data-place', String(index));
  }
}

forEachBand(activity.bands, (band) => {
  test('a tile that cannot slide wobbles, the movable ones glow, and sliding them home finishes the picture', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectBoardShows(page, level.board);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Two clicks on a tile far from the space move nothing, and then the tiles that can slide glow.
    const space = level.board.indexOf(null);
    const near = neighborsOf(space, level.columns, level.rows);
    const far = level.board.findIndex((tile, index) => tile !== null && index !== space && !near.includes(index));
    if (far === -1) throw new Error('Every board has a tile away from the space');
    const farTile = page.locator(`[data-place="${String(far)}"]`);
    await farTile.click();
    await farTile.click();
    await expectBoardShows(page, level.board);
    await expect(page.locator('[data-tile][data-hint="true"]')).toHaveCount(near.length);
    await expect.poll(() => spokenIds(page)).toContain(strings.canMove.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-hint`);

    let board = level.board;
    for (const index of solution(level)) {
      await page.locator(`[data-place="${String(index)}"]`).click();
      board = slide(board, index, level.columns, level.rows) ?? board;
      await expectBoardShows(page, board);
    }
    await expect(page.locator('.sp-board')).toHaveAttribute('data-done', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.allDone.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-done`);

    await expectBoardShows(page, generateLevel(roundSeed(SEED, 1), min, band).board);
  });

  test('can be played with the arrow keys alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectBoardShows(page, level.board);
    let board = level.board;
    for (const index of solution(level)) {
      await page.keyboard.press(arrowFor(level, board, index));
      board = slide(board, index, level.columns, level.rows) ?? board;
      await expectBoardShows(page, board);
    }
    await expect(page.locator('.sp-board')).toHaveAttribute('data-done', 'true');
  });

  test('fits the biggest board of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-tile]'],
        ready: (page) => expectBoardShows(page, level.board),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
