import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { feedback, numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/number-line/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/number-line/level.ts';
import { strings } from '../../src/features/early-learning/activities/number-line/strings.ts';
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

/** The lowest difficulty with a place round in the band's range. */
const PLACE_AT: Readonly<Partial<Record<Band, number>>> = { 'band-6-8': 4, 'band-9-12': 4 };

forEachBand(activity.bands, (band: Band) => {
  test('fills the missing number on the line', async () => {
    const { min } = rangeOf(activity, band);
    // band-9-12 starts with place rounds; its missing rounds are counting by twos and fives.
    const difficulty = band === 'band-6-8' ? min : 6;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    expect(level.mode).toBe('missing');

    await expectInstructionSpoken(page, strings.missing);
    for (const mark of level.marks.filter((each) => each.labeled)) {
      await expect(page.locator(`[data-mark="${String(mark.index)}"]`)).toHaveText(String(mark.value));
    }
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-look', 'tried');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    // The blank on the line now shows the number.
    await expect(page.locator(`[data-mark="${String(level.target)}"]`)).toHaveText(String(level.answer));
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('places a number on the line, with help after two wrong tries', async () => {
    const difficulty = PLACE_AT[band] ?? 4;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    expect(level.mode).toBe('place');

    await expectInstructionSpoken(page, strings.placeFor);
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.answer).id);
    await expect(page.locator('.line-number')).toHaveText(String(level.answer));
    await saveBandScreenshot(page, band, activity.id, 'place');
    await expectAccessible(page);

    const wrong = level.marks.filter((mark) => !mark.labeled && mark.index !== level.target).slice(0, 2);
    for (const mark of wrong) await page.locator(`[data-mark="${String(mark.index)}"]`).click();
    await expect(page.locator(`[data-mark="${String(level.target)}"]`)).toHaveAttribute('data-look', 'hint');
    await expect.poll(() => spokenIds(page)).toContain(feedback.hereItIs.id);

    await page.locator(`[data-mark="${String(level.target)}"]`).click();
    await expect(page.locator(`[data-mark="${String(level.target)}"]`)).toHaveText(String(level.answer));
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const difficulty = PLACE_AT[band] ?? 4;
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), difficulty, band);
    await tabToAndPress(page, `[data-mark="${String(level.target)}"]`);
    await expect(page.locator(`[data-mark="${String(level.target)}"]`)).toHaveAttribute('data-look', 'answer');
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const level = generateLevel(roundSeed(SEED, 0), max, band);
      await expectTargetsFit(page, band, size, level.mode === 'place' ? ['[data-look]'] : ['[data-choice]']);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
