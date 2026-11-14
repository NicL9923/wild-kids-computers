import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/sight-words/activity.ts';
import { generateLevel, type SightWordsLevel } from '../../src/features/early-learning/activities/sight-words/level.ts';
import { strings, wordHandle } from '../../src/features/early-learning/activities/sight-words/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: SightWordsLevel): Promise<void> {
  await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
}

forEachBand(activity.bands, (band) => {
  test('says the word, reads a wrong pick aloud, and the word heard ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(wordHandle(level.answer).id);
    // The line shows the sentence, not the word, which would give the answer away.
    await expect(page.locator('.wk-instruction-text')).toHaveText(strings.instruction.text);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((word) => word !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong word');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(wordHandle(wrong).id);
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator(`[data-choice="${level.answer}"]`)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-answered`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    await tabTo(page, `[data-choice="${level.answer}"]`);
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
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
