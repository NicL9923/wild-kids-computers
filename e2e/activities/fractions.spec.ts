import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/fractions/activity.ts';
import { fractionKey, generateLevel } from '../../src/features/early-learning/activities/fractions/level.ts';
import { fractionName } from '../../src/features/early-learning/activities/fractions/names.ts';
import { strings } from '../../src/features/early-learning/activities/fractions/strings.ts';
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
  test('finds the picture for a fraction', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.mode).toBe('pick-picture');

    await expectInstructionSpoken(page, strings.findPicture);
    await expect.poll(() => spokenIds(page)).toContain(fractionName(level.target).id);
    await expect(page.locator('[data-picture]')).toHaveCount(level.pictures.length);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.pictures.find((picture) => picture.id !== level.answer);
    if (wrong === undefined) throw new Error('A round always has a wrong picture');
    await page.locator(`[data-picture="${wrong.id}"]`).click();
    await expect(page.locator(`[data-picture="${wrong.id}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-picture="${level.answer}"]`).click();
    await expect(page.locator(`[data-picture="${level.answer}"]`)).toHaveAttribute('data-look', 'answer');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('finds the fraction for a picture with the keyboard alone', async () => {
    // Difficulty 5 is the first round that shows one picture and asks for its fraction.
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 5 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 5, band);
    expect(level.mode).toBe('pick-fraction');

    await expectInstructionSpoken(page, strings.whichFraction);
    await saveBandScreenshot(page, band, activity.id, 'pick-fraction');
    await expectAccessible(page);
    const answer = `[data-fraction="${fractionKey(level.target)}"]`;
    await tabToAndPress(page, answer);
    await expect(page.locator(answer)).toHaveAttribute('data-look', 'answer');
    await expect.poll(() => spokenIds(page)).toContain(fractionName(level.target).id);
  });

  test('fits the most crowded round of the band at both review sizes', async () => {
    // Four pictures at difficulty 7 for band-9-12; band-6-8 tops out at fractions to choose from.
    const { max } = rangeOf(activity, band);
    const difficulty = Math.min(max, 7);
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    const targets = level.mode === 'pick-picture' ? ['[data-picture]', '.fraction-card'] : ['[data-fraction]'];
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, targets);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
