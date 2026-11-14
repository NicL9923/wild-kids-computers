import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/missing-letter/activity.ts';
import {
  generateLevel,
  type MissingLetterLevel,
} from '../../src/features/early-learning/activities/missing-letter/level.ts';
import { strings } from '../../src/features/early-learning/activities/missing-letter/strings.ts';
import { letterSound } from '../../src/features/early-learning/reading/alphabet.ts';
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

async function expectRoundShows(page: Page, level: MissingLetterLevel): Promise<void> {
  await expect(page.locator('[data-word]')).toHaveAttribute('data-word', level.word);
  await expect(page.locator('[data-shown]')).toHaveText(level.letters.filter((_, index) => index !== level.gap));
  await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
}

forEachBand(activity.bands, (band) => {
  test('says the word, and the missing letter fills the gap', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[level.word].id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((letter) => letter !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong letter');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator('[data-gap]')).toHaveText('');

    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator('[data-gap]')).toHaveText(level.answer);
    await expect.poll(() => spokenIds(page)).toContain(letterSound(level.answer).id);
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
    // Focus says the letter's sound, so the child can sound the word out.
    await expect.poll(() => spokenIds(page)).toContain(letterSound(level.answer).id);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-gap]')).toHaveText(level.answer);
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
