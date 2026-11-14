import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/mirror-symmetry/activity.ts';
import {
  cellsToFill,
  generateLevel,
  inChildHalf,
  isFilled,
  type Cell,
  type MirrorLevel,
} from '../../src/features/early-learning/activities/mirror-symmetry/level.ts';
import { strings } from '../../src/features/early-learning/activities/mirror-symmetry/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const square = (cell: Cell) => `[data-cell="${String(cell.row)}-${String(cell.column)}"]`;

async function expectRoundShows(page: Page, level: MirrorLevel): Promise<void> {
  await expect(page.locator('.ms-grid')).toHaveAttribute('data-axis', level.axis);
  await expect(page.locator('.ms-grid')).toHaveAttribute('data-given', level.given);
  await expect(page.locator('[data-cell]')).toHaveCount((level.size * level.size) / 2);
  await expect(page.locator('[data-shown="true"]')).toHaveCount(cellsToFill(level).length);
}

/** A square in the child's half that the mirror leaves empty. */
function emptySquare(level: MirrorLevel): Cell {
  for (let row = 0; row < level.size; row += 1) {
    for (let column = 0; column < level.size; column += 1) {
      const cell = { row, column };
      if (inChildHalf(level, cell) && !isFilled(level, cell)) return cell;
    }
  }
  throw new Error('This seed gives no empty square; pick another seed.');
}

forEachBand(activity.bands, (band) => {
  test('fills the mirror half square by square, and a square the mirror leaves empty stays empty', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const empty = emptySquare(level);
    await page.locator(square(empty)).click();
    await expect.poll(() => spokenIds(page)).toContain(feedback.lookAgain.id);
    await expect(page.locator(square(empty))).toHaveAttribute('data-filled', 'false');

    for (const cell of cellsToFill(level)) {
      await page.locator(square(cell)).click();
      await expect(page.locator(square(cell))).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-done`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('shows the next square after two tries that miss', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    const empty = emptySquare(level);
    await page.locator(square(empty)).click();
    await page.locator(square(empty)).click();
    const [next] = cellsToFill(level);
    if (next === undefined) throw new Error('A round always has squares to fill');
    await expect(page.locator(square(next))).toHaveAttribute('data-hint', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.hereItIs.id);
  });

  test('can be played with the keyboard alone, moving with the arrow keys', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    const start =
      level.axis === 'vertical'
        ? { row: 0, column: level.given === 'first' ? level.size / 2 : 0 }
        : { row: level.given === 'first' ? level.size / 2 : 0, column: 0 };
    await tabTo(page, square(start));
    let at = start;
    for (const cell of cellsToFill(level)) {
      const rows = cell.row - at.row;
      const columns = cell.column - at.column;
      for (let step = 0; step < Math.abs(rows); step += 1)
        await page.keyboard.press(rows > 0 ? 'ArrowDown' : 'ArrowUp');
      for (let step = 0; step < Math.abs(columns); step += 1) {
        await page.keyboard.press(columns > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      await expect(page.locator(square(cell))).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(square(cell))).toHaveAttribute('data-filled', 'true');
      at = cell;
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-cell]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
