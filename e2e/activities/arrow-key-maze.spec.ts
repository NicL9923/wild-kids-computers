import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/arrow-key-maze/activity.ts';
import {
  canMove,
  DIRECTIONS,
  generateLevel,
  type Direction,
} from '../../src/features/computer-skills/activities/arrow-key-maze/level.ts';
import { strings } from '../../src/features/computer-skills/activities/arrow-key-maze/strings.ts';
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

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const KEYS: Readonly<Record<Direction, string>> = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`arrow-key-maze serves ${band}`);
  return range;
}

const board = (page: Page) => page.locator('.maze-board');
const at = (cell: { x: number; y: number }) => `${String(cell.x)},${String(cell.y)}`;

forEachBand(activity.bands, (band) => {
  test('steers the critter to its snack with the arrow keys, and the next maze starts', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expect(board(page)).toHaveAttribute('data-at', at(level.start));
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The replay control has focus now; arrow keys still steer, because a button does not use them.
    for (const direction of level.path) await page.keyboard.press(KEYS[direction]);
    await expect(board(page)).toHaveAttribute('data-at', at(level.goal));
    await expect(board(page)).toHaveAttribute('data-arrived', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    // Two clean rounds raise the level; one keeps it, so round two is the same size from its own seed.
    const second = generateLevel(roundSeed(SEED, 1), min, band);
    await expect(board(page)).toHaveAttribute('data-at', at(second.start));
  });

  test('a wall stops the critter without a fuss, and after two bumps the next arrow lights up', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const blocked = DIRECTIONS.find((direction) => !canMove(level.cells, level.start, direction));
    const first = level.path[0];
    if (blocked === undefined || first === undefined) throw new Error('A corner start always has a wall');
    await expect(board(page)).toHaveAttribute('data-at', at(level.start));

    await page.keyboard.press(KEYS[blocked]);
    await expect(board(page)).toHaveAttribute('data-at', at(level.start));
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(page.locator(`[data-key="${KEYS[first]}"]`)).toHaveAttribute('data-mark', 'none');
    await page.keyboard.press(KEYS[blocked]);
    await expect(page.locator(`[data-key="${KEYS[first]}"]`)).toHaveAttribute('data-mark', 'target');
    await expect.poll(() => spokenIds(page)).toContain(strings.thisWay.id);
    await saveBandScreenshot(page, band, activity.id, 'help');
    // The lit arrow is the way on.
    await page.keyboard.press(KEYS[first]);
    await expect(board(page)).not.toHaveAttribute('data-at', at(level.start));
  });

  test('other keys bring a reminder about the arrow keys, and move nothing', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expect(board(page)).toHaveAttribute('data-at', at(level.start));
    await page.keyboard.press('a');
    await page.keyboard.press('7');
    await expect.poll(() => spokenIds(page)).toContain(strings.arrowKeys.id);
    await expect(page.locator('[data-key="ArrowUp"]')).toHaveAttribute('data-mark', 'target');
    await expect(board(page)).toHaveAttribute('data-at', at(level.start));
  });

  test('fits the largest maze of the band with big cells at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const critter = await page.locator('.maze-critter').boundingBox();
      const area = await board(page).boundingBox();
      if (critter === null || area === null) throw new Error('The maze is missing');
      expect(critter.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
      expect(area.y + area.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
