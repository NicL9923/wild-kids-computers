import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/skip-counting/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/skip-counting/level.ts';
import { strings } from '../../src/features/early-learning/activities/skip-counting/strings.ts';
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

const COUNT_BY = { 2: strings.byTwos, 5: strings.byFives, 10: strings.byTens } as const;

forEachBand(activity.bands, (band: Band) => {
  test('says the count, and the right number fills the blank stone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectInstructionSpoken(page, COUNT_BY[level.step]);
    for (const [index, value] of level.numbers.entries()) {
      if (index !== level.blank)
        await expect(page.locator(`[data-stone="${String(index)}"]`)).toHaveText(new RegExp(`${String(value)}$`));
    }
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    await expect(page.locator(`[data-stone="${String(level.blank)}"] .math-blank`)).toHaveText(String(level.answer));
    // The whole count is said, up to its last number.
    const last = level.numbers.at(-1) ?? 0;
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(last).id);
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await expectInstructionSpoken(page, COUNT_BY[level.step]);
    await tabToAndPress(page, `[data-choice="${String(level.answer)}"]`);
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, ['[data-choice]', '.skip-stone']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
