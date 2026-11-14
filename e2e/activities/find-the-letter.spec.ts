import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/find-the-letter/activity.ts';
import {
  generateLevel,
  type FindTheLetterLevel,
} from '../../src/features/early-learning/activities/find-the-letter/level.ts';
import { strings } from '../../src/features/early-learning/activities/find-the-letter/strings.ts';
import { letterName, shown } from '../../src/features/early-learning/reading/alphabet.ts';
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

async function expectRoundShows(page: Page, level: FindTheLetterLevel): Promise<void> {
  await expect(page.locator('[data-choice]')).toHaveText(
    level.choices.map((letter) => shown(letter, level.letterCase)),
  );
}

forEachBand(activity.bands, (band) => {
  test('names the letter, says the name of a wrong pick, and the right letter ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(letterName(level.answer).id);
    // The line shows the sentence but not the letter, which would give the answer away.
    await expect(page.locator('.wk-instruction-text')).toHaveText(strings.instruction.text);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((letter) => letter !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong letter');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(letterName(wrong).id);
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator(`[data-choice="${level.answer}"]`)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-answered`);

    await expectRoundShows(page, next);
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

test('after two wrong picks the answer stands out, and it counts as a hint', async () => {
  const band = 'band-3-5';
  // Difficulty 2 offers three letters, so two wrong picks are possible.
  launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 2 });
  const { page } = launched;
  const level = generateLevel(roundSeed(SEED, 0), 2, band);
  await expectRoundShows(page, level);
  const answer = page.locator(`[data-choice="${level.answer}"]`);
  for (const wrong of level.choices.filter((letter) => letter !== level.answer)) {
    await expect(answer).toHaveAttribute('data-hint', 'false');
    await page.locator(`[data-choice="${wrong}"]`).click();
  }
  await expect(answer).toHaveAttribute('data-hint', 'true');
  await expect.poll(() => spokenIds(page)).toContain(feedback.hereItIs.id);
  await saveBandScreenshot(page, band, `${activity.id}-hint`);
});
