import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/times-tables/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/times-tables/level.ts';
import { strings } from '../../src/features/early-learning/activities/times-tables/strings.ts';
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
  test('shows the rows of things, and the right product ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectInstructionSpoken(page, level.show === 'array' ? strings.rowsOf : strings.whatIs);
    await expect(page.locator('.times-array img')).toHaveCount(level.answer);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.answer).id);
  });

  test('brings the rows back as help after two wrong tries on a fact alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    expect(level.show).toBe('fact');

    await expect(page.locator('.math-sentence')).toContainText(`${String(level.rows)}×${String(level.columns)}`);
    await expect(page.locator('.times-array')).toHaveCount(0);
    await saveBandScreenshot(page, band, activity.id, 'fact');
    const wrong = level.choices.filter((choice) => choice !== level.answer).slice(0, 2);
    for (const choice of wrong) await page.locator(`[data-choice="${String(choice)}"]`).click();
    await expect(page.locator('.times-array img')).toHaveCount(level.answer);
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'hint');
    await saveBandScreenshot(page, band, activity.id, 'fact-help');
    await expectAccessible(page);
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await tabToAndPress(page, `[data-choice="${String(level.answer)}"]`);
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
  });

  test('fits the largest array of the band at both review sizes', async () => {
    // The largest array is the most crowded screen: tables of ten beside the fact.
    const difficulty = 3;
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, ['[data-choice]']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
