import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import { letterName, letterSound } from '../../src/features/early-learning/reading/alphabet.ts';
import activity from '../../src/features/early-learning/activities/letter-sounds/activity.ts';
import { generateLevel } from '../../src/features/early-learning/activities/letter-sounds/level.ts';
import { strings } from '../../src/features/early-learning/activities/letter-sounds/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

forEachBand(activity.bands, (band) => {
  test('says the sound, sets a wrong letter aside, and the right letter ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
    // The round's instruction ends with the sound itself, and replay says both.
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(letterSound(level.answer).id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The speaker says the sound again.
    const before = (await spokenIds(page)).length;
    await page.locator('[data-control="hear"]').click();
    await expect.poll(async () => (await spokenIds(page)).slice(before)).toContain(letterSound(level.answer).id);

    // A wrong letter says its name and steps back; the round goes on.
    const wrong = level.choices.find((letter) => letter !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong letter');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect.poll(() => spokenIds(page)).toContain(letterName(wrong).id);

    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator(`[data-choice="${level.answer}"]`)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-answered`);

    await expect(page.locator('[data-choice]')).toHaveText(next.choices.map(String));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await tabTo(page, `[data-choice="${level.answer}"]`);
    // Focus says the letter's name, for a child who cannot read it yet.
    await expect.poll(() => spokenIds(page)).toContain(letterName(level.answer).id);
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-choice="${level.answer}"]`)).toHaveAttribute('data-answer', 'true');
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
        targets: ['[data-choice]', '[data-control="hear"]'],
        ready: (page) => expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String)),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
