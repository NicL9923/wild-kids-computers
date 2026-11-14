import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/mazes/activity.ts';
import {
  canMove,
  DIRECTIONS,
  generateLevel,
  keyOf,
  neighbor,
  straightRun,
  type Cell,
  type Direction,
  type MazeLevel,
} from '../../src/features/early-learning/activities/mazes/level.ts';
import { strings } from '../../src/features/early-learning/activities/mazes/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { settle } from '../support/logic.ts';
import { rangeOf } from '../support/reading.ts';

const SEED = 4_242;

const KEYS: Readonly<Record<Direction, string>> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};

/** The smallest target per band, from the spec's age band table. */
const SMALLEST: Readonly<Record<string, number>> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const board = (page: Page) => page.locator('.mz-board');

async function expectRoundShows(page: Page, level: MazeLevel): Promise<void> {
  await expect(board(page)).toHaveAttribute('data-at', keyOf(level.start));
  await expect(board(page)).toHaveAttribute('data-arrived', 'false');
}

/** The center of a cell on screen. */
async function centerOfCell(page: Page, level: MazeLevel, cell: Cell): Promise<{ x: number; y: number }> {
  const box = await board(page).boundingBox();
  if (box === null) throw new Error('The maze is not on screen');
  return {
    x: box.x + ((cell.x + 0.5) / level.columns) * box.width,
    y: box.y + ((cell.y + 0.5) / level.rows) * box.height,
  };
}

/** The cells along the path, start first. */
function cellsOf(level: MazeLevel): Cell[] {
  const cells: Cell[] = [level.start];
  for (const direction of level.path) {
    const last = cells.at(-1) ?? level.start;
    const next = neighbor(last, direction, level.columns, level.rows);
    if (next === null) throw new Error('The path leaves the maze');
    cells.push(next);
  }
  return cells;
}

/** A direction from the start that a wall blocks. */
function blockedFromStart(level: MazeLevel): Direction {
  const blocked = DIRECTIONS.find((direction) => !canMove(level.cells, level.start, direction));
  if (blocked === undefined) throw new Error('A corner always has a wall');
  return blocked;
}

forEachBand(activity.bands, (band) => {
  test('a wall stops the animal, and moving the pointer along the path takes it to the snack', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Two bumps into a wall leave the animal where it is, and the next cell on the way glows.
    const wall = KEYS[blockedFromStart(level)];
    await page.keyboard.press(wall);
    await page.keyboard.press(wall);
    await expect(board(page)).toHaveAttribute('data-at', keyOf(level.start));
    const [, second] = cellsOf(level);
    if (second === undefined) throw new Error('The path has a step');
    await expect(page.locator('[data-hint]')).toHaveAttribute('data-hint', keyOf(second));
    await expect.poll(() => spokenIds(page)).toContain(strings.thisWay.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-hint`);

    // The pointer leads the animal cell by cell, and the walked cells keep a dot.
    // The pointer jumps onto the animal first, so it passes over no other cell on the way in.
    for (const [index, cell] of cellsOf(level).entries()) {
      const at = await centerOfCell(page, level, cell);
      await page.mouse.move(at.x, at.y, { steps: index === 0 ? 1 : 4 });
    }
    await expect(board(page)).toHaveAttribute('data-arrived', 'true');
    await expect(page.locator('[data-trail]')).toHaveCount(level.path.length + 1);
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').last()).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youFoundIt.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-arrived`);

    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the arrow keys alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    for (const direction of level.path) await page.keyboard.press(KEYS[direction]);
    await expect(board(page)).toHaveAttribute('data-arrived', 'true');
  });

  test('the animal goes straight to a cell in an open line, and stays put for a cell it cannot reach', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), max, band);
    await expectRoundShows(page, level);
    // The snack is never in a straight open line from the start, so a click there is a quiet miss.
    if (straightRun(level, level.start, level.goal) !== null) throw new Error('Pick a seed with a winding path');
    const goal = await centerOfCell(page, level, level.goal);
    await page.mouse.move(goal.x, goal.y, { steps: 1 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-at', keyOf(level.start));

    // The end of the first straight stretch of the path.
    const [first] = level.path;
    const run = level.path.findIndex((direction) => direction !== first);
    const target = cellsOf(level)[run === -1 ? level.path.length : run];
    if (target === undefined) throw new Error('The path has a step');
    // Jump the pointer straight there, so no cell in between is passed over.
    const at = await centerOfCell(page, level, target);
    await page.mouse.move(at.x, at.y, { steps: 1 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(board(page)).toHaveAttribute('data-at', keyOf(target));
  });

  test('fits the biggest maze of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expectRoundShows(page, level);
      const box = await board(page).boundingBox();
      const controls = await page
        .locator('[data-control]')
        .evaluateAll((elements) => Math.max(...elements.map((element) => element.getBoundingClientRect().bottom)));
      if (box === null) throw new Error('The maze is not on screen');
      expect(box.y).toBeGreaterThan(controls);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      // Every cell is at least the band's smallest target.
      expect(box.width / level.columns).toBeGreaterThanOrEqual(SMALLEST[band] ?? 72);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
