import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/add-and-subtract/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/add-and-subtract/level.ts';
import { strings } from '../../src/features/early-learning/activities/add-and-subtract/strings.ts';
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
  test('counts the things out loud, and the right number ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expectInstructionSpoken(page, level.operation === 'add' ? strings.add : strings.subtract);
    const left = level.operation === 'add' ? level.answer : level.first - level.second;
    await expect(page.locator('[data-thing]')).toHaveCount(left);
    await expect(page.locator('[data-gone]')).toHaveCount(level.operation === 'add' ? 0 : level.second);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Touching each thing counts it: its number appears on it and is spoken.
    const things = page.locator('[data-thing]');
    for (let index = 0; index < left; index += 1) {
      await things.nth(index).click();
      await expect(things.nth(index).locator('[data-counted]')).toHaveText(String(index + 1));
    }
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.answer).id);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-answered`);

    await expect(page.locator('[data-choice]')).toHaveText(next.choices.map(String));
  });

  test('shows the number sentence and can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    if (level.show !== 'things') {
      await expectInstructionSpoken(page, strings.whatIs);
      await expect(page.locator('.math-sentence')).toContainText(String(level.second));
    }
    await tabToAndPress(page, `[data-choice="${String(level.answer)}"]`);
    await expect(page.locator(`[data-choice="${String(level.answer)}"]`)).toHaveAttribute('data-look', 'answer');
    await expect(page.locator('.math-blank')).toHaveText(level.show === 'things' ? [] : [String(level.answer)]);
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    // The largest round with things to count, which is the most crowded screen.
    const crowded = band === 'band-3-5' ? max : 8;
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: crowded, size });
      const { page } = launched;
      await expectTargetsFit(page, band, size, ['[data-choice]', '.add-thing']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
