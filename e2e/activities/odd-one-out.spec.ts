import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/odd-one-out/activity.ts';
import { generateLevel, type OddOneOutLevel } from '../../src/features/early-learning/activities/odd-one-out/level.ts';
import { strings } from '../../src/features/early-learning/activities/odd-one-out/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { settle } from '../support/logic.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const choice = (page: Page, item: string) => page.locator(`[data-choice="${item}"]`);

async function expectRoundShows(page: Page, level: OddOneOutLevel): Promise<void> {
  await expect(page.locator('[data-choice]')).toHaveCount(level.items.length);
  for (const [index, item] of level.items.entries()) {
    await expect(page.locator('[data-choice]').nth(index)).toHaveAttribute('data-choice', item);
  }
}

/** The reason said after the answer, by group. */
const reasonOf = (level: OddOneOutLevel) => {
  const reasons: Partial<Record<string, { id: string }>> = strings;
  const reason = reasons[level.group];
  if (reason === undefined) throw new Error(`No reason for ${level.group}`);
  return reason;
};

forEachBand(activity.bands, (band) => {
  test('sets a picture from the group aside, and the odd one ends the round with the reason', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // A picture says its name under the pointer, so a child who cannot read knows what it is.
    const same = level.items.find((item) => item !== level.odd);
    if (same === undefined) throw new Error('A round always has pictures from the group');
    await choice(page, same).hover();
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[same].id);

    await choice(page, same).click();
    await expect(choice(page, same)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await choice(page, level.odd).click();
    await expect(choice(page, level.odd)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(reasonOf(level).id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-answered`);

    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    await tabTo(page, `[data-choice="${level.odd}"]`);
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[level.odd].id);
    await page.keyboard.press('Enter');
    await expect(choice(page, level.odd)).toHaveAttribute('data-answer', 'true');
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
        targets: ['[data-choice]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
