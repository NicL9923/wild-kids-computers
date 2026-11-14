import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/make-ten/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/make-ten/level.ts';
import { strings } from '../../src/features/early-learning/activities/make-ten/strings.ts';
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
import { expectTargetsFit, rangeOf, tabToAndPress } from '../support/mathActivity.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

forEachBand(activity.bands, (band: Band) => {
  test('counts on by filling empty spaces, and the right number fills the frame', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectInstructionSpoken(page, level.whole === 10 ? strings.ten : strings.five);
    await expect(page.locator('[data-counter="given"]')).toHaveCount(level.filled);
    await expect(page.locator('[data-counter="none"]')).toHaveCount(level.answer);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Touching each empty space adds a counter and says how many have been added.
    const empty = level.spaces.flatMap((full, index) => (full ? [] : [index]));
    for (const index of empty) await page.locator(`[data-space="${String(index)}"]`).click();
    await expect(page.locator('[data-counter="added"]')).toHaveCount(level.answer);
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.answer).id);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    // The frame is full. Checked before the sentence ends, because the next round follows it.
    await expect(page.locator('[data-counter="none"]')).toHaveCount(0);
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.whole).id);
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await expect(page.locator('[data-counter="given"]')).toHaveCount(level.filled);
    await tabToAndPress(page, `[data-choice="${String(level.answer)}"]`);
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, ['[data-space]', '[data-choice]']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
