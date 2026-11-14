import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/first-sound/activity.ts';
import { generateLevel, type FirstSoundLevel } from '../../src/features/early-learning/activities/first-sound/level.ts';
import { strings } from '../../src/features/early-learning/activities/first-sound/strings.ts';
import { letterName, letterSound } from '../../src/features/early-learning/reading/alphabet.ts';
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

async function expectRoundShows(page: Page, level: FirstSoundLevel): Promise<void> {
  await expect(page.locator('[data-word]')).toHaveAttribute('data-word', level.word);
  await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
}

forEachBand(activity.bands, (band) => {
  test('says the pictured word, sets a wrong letter aside, and the first letter ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    const word = emojiNames[level.word];

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(word.id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Pressing the picture says its name again.
    const before = (await spokenIds(page)).length;
    await page.getByRole('button', { name: word.text, exact: true }).click();
    await expect.poll(async () => (await spokenIds(page)).slice(before)).toContain(word.id);

    const wrong = level.choices.find((letter) => letter !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong letter');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    // The right letter says its sound, so the child hears it at the start of the word.
    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator(`[data-choice="${level.answer}"]`)).toHaveAttribute('data-answer', 'true');
    await expect.poll(() => spokenIds(page)).toContain(letterSound(level.answer).id);
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
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
