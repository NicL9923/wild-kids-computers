import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import { colors, shapes } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/what-comes-next/activity.ts';
import {
  generateLevel,
  isShape,
  SHAPE_COLORS,
  type PatternItem,
  type WhatComesNextLevel,
} from '../../src/features/early-learning/activities/what-comes-next/level.ts';
import { strings } from '../../src/features/early-learning/activities/what-comes-next/strings.ts';
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

async function expectRoundShows(page: Page, level: WhatComesNextLevel): Promise<void> {
  await expect(page.locator('[data-item]')).toHaveCount(level.shown.length);
  for (const [index, item] of level.shown.entries()) {
    await expect(page.locator('[data-item]').nth(index)).toHaveAttribute('data-item', item);
  }
  await expect(page.locator('[data-choice]')).toHaveCount(level.choices.length);
}

/** The string ids a choice says, such as "red" and "circle". */
function nameIds(item: PatternItem): string[] {
  if (isShape(item)) return [colors[SHAPE_COLORS[item]].id, shapes[item].id];
  return [emojiNames[item].id];
}

forEachBand(activity.bands, (band) => {
  test('sets a wrong choice aside, and the right one fills the empty box', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((item) => item !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong choice');
    // A choice says its name under the pointer, so a child who cannot read knows what it is.
    await choice(page, wrong).hover();
    await expect.poll(() => spokenIds(page)).toContain(nameIds(wrong)[0]);

    await choice(page, wrong).click();
    await expect(choice(page, wrong)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator('[data-next]')).toHaveAttribute('data-next', '');

    await choice(page, level.answer).click();
    await expect(page.locator('[data-next]')).toHaveAttribute('data-next', level.answer);
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
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
    await tabTo(page, `[data-choice="${level.answer}"]`);
    await expect.poll(() => spokenIds(page)).toContain(nameIds(level.answer)[0]);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-next]')).toHaveAttribute('data-next', level.answer);
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
