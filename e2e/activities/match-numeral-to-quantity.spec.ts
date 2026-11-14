import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/match-numeral-to-quantity/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/match-numeral-to-quantity/level.ts';
import { strings } from '../../src/features/early-learning/activities/match-numeral-to-quantity/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { busiestSeed, expectTargetsFit, rangeOf, tabToAndPress } from '../support/mathActivity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

forEachBand(activity.bands, (band: Band) => {
  test('sets a wrong group aside, shows the right one after two tries, and the right group ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expectInstructionSpoken(page, strings.find);
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.target).id);
    await expect(page.locator('.match-numeral')).toHaveText(String(level.target));
    for (const group of level.groups) {
      await expect(page.locator(`[data-group="${group.id}"] img`)).toHaveCount(group.count);
    }
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // A wrong group steps back with a neutral line; the round goes on.
    const wrong = level.groups.filter((group) => group.id !== level.answer);
    const first = wrong[0];
    if (first === undefined) throw new Error('A round always has a wrong group');
    await page.locator(`[data-group="${first.id}"]`).click();
    await expect(page.locator(`[data-group="${first.id}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    const second = wrong[1];
    if (second !== undefined) {
      await page.locator(`[data-group="${second.id}"]`).click();
      await expect(page.locator(`[data-group="${level.answer}"]`)).toHaveAttribute('data-look', 'hint');
      await expect.poll(() => spokenIds(page)).toContain(feedback.hereItIs.id);
    }

    await page.locator(`[data-group="${level.answer}"]`).click();
    await expect(page.locator(`[data-group="${level.answer}"]`)).toHaveAttribute('data-look', 'answer');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.thatsIt.id);

    await expect(page.locator('.match-numeral')).toHaveText(String(next.target));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await tabToAndPress(page, `[data-group="${level.answer}"]`);
    await expect(page.locator(`[data-group="${level.answer}"]`)).toHaveAttribute('data-look', 'answer');
  });

  test('fits the hardest round of the band at both review sizes, each thing at least a target wide', async () => {
    const { max } = rangeOf(activity, band);
    // The busiest round of the hardest level: the seed whose largest group has the most things.
    const seed = busiestSeed((candidate) => generateLevel(roundSeed(candidate, 0), max, band).groups);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed, difficulty: max, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, ['[data-group]', '.match-numeral', '.math-object']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
