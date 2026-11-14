import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/wake-the-meadow/activity.ts';
import {
  budsWokenBy,
  EDGE_MARGIN,
  generateLevel,
  MAX_MEADOW_DIFFICULTY,
  MEADOW,
  stepFor,
} from '../../src/features/computer-skills/activities/wake-the-meadow/level.ts';
import { strings } from '../../src/features/computer-skills/activities/wake-the-meadow/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
} from '../support/activity.ts';
import { readAudioLog } from '../support/audioLog.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 31_337;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const board = (page: Page) => page.locator('.meadow-board');

/** A point in meadow units, in window pixels. */
async function meadowPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await board(page).boundingBox();
  if (box === null) throw new Error('The meadow is missing');
  return { x: box.x + (x / MEADOW.width) * box.width, y: box.y + (y / MEADOW.height) * box.height };
}

/** Moves the real mouse straight across the meadow at one height, in small steps. */
async function sweepAcross(page: Page, y: number): Promise<void> {
  const start = await meadowPoint(page, 5, y);
  const end = await meadowPoint(page, MEADOW.width - 5, y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.move(end.x, end.y, { steps: 24 });
}

forEachBand(activity.bands, (band) => {
  test('wakes the flowers under the moving pointer at once, and the round ends when enough are awake', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 1, band);
    const next = generateLevel(roundSeed(SEED, 1), 1, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expect(page.locator('[data-bud]')).toHaveCount(level.buds.length);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // One small move next to a bud opens it, with no click.
    const first = level.buds[0];
    if (first === undefined) throw new Error('A meadow has buds');
    const near = await meadowPoint(page, first.x, first.y);
    await page.mouse.move(near.x - 4, near.y);
    await page.mouse.move(near.x, near.y);
    const woken = budsWokenBy(level, first, first);
    await expect(page.locator(`[data-bud="${first.id}"]`)).toHaveAttribute('data-awake', 'true');
    await expect(board(page)).toHaveAttribute('data-awake', String(woken.length));
    await expect.poll(async () => (await readAudioLog(page)).some((entry) => entry.name === 'bloom')).toBe(true);
    await saveBandScreenshot(page, band, `${activity.id}-waking`);

    // One sweep across the middle wakes the easiest meadow, and every flower opens.
    await sweepAcross(page, MEADOW.height / 2);
    await expect(board(page)).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-bud][data-awake="false"]')).toHaveCount(0);
    await saveBandScreenshot(page, band, `${activity.id}-awake`);

    // The next meadow comes from the next round seed, all asleep.
    await expect(page.locator('[data-bud]')).toHaveCount(next.buds.length);
    await expect(board(page)).toHaveAttribute('data-awake', '0');
  });

  test('a sweep along each row wakes the hardest meadow', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: MAX_MEADOW_DIFFICULTY });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), MAX_MEADOW_DIFFICULTY, band);
    const { rows } = stepFor(MAX_MEADOW_DIFFICULTY);
    const rowHeight = (MEADOW.height - 2 * EDGE_MARGIN) / rows;
    await expect(page.locator('[data-bud]')).toHaveCount(level.buds.length);
    await sweepAcross(page, EDGE_MARGIN + 0.5 * rowHeight);
    // One row is not enough of the meadow yet.
    await expect(board(page)).toHaveAttribute('data-done', 'false');
    for (let row = 1; row < rows; row += 1) await sweepAcross(page, EDGE_MARGIN + (row + 0.5) * rowHeight);
    await expect(board(page)).toHaveAttribute('data-done', 'true');
  });

  test('keeps buds large at both review sizes', async () => {
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({
        activity: activity.id,
        band,
        seed: SEED,
        difficulty: MAX_MEADOW_DIFFICULTY,
        size,
      });
      const { page } = launched;
      const boxes = await page.locator('[data-bud]').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, bottom: rect.bottom, right: rect.right };
        }),
      );
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(72);
        expect(box.bottom).toBeLessThanOrEqual(size.height);
        expect(box.right).toBeLessThanOrEqual(size.width);
      }
      const middle = await meadowPoint(page, 500, 300);
      await page.mouse.move(middle.x, middle.y);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
