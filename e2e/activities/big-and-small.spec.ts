import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/big-and-small/activity.ts';
import {
  generateLevel,
  type BigAndSmallLevel,
} from '../../src/features/early-learning/activities/big-and-small/level.ts';
import { strings } from '../../src/features/early-learning/activities/big-and-small/strings.ts';
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
/** The first difficulty with order rounds, in both bands' ranges. */
const ORDER_DIFFICULTY = 5;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: BigAndSmallLevel): Promise<void> {
  await expect(page.locator('.bs-stage')).toHaveAttribute('data-mode', level.mode);
  await expect(page.locator('[data-item]')).toHaveCount(level.items.length);
  for (const [index, item] of level.items.entries()) {
    await expect(page.locator('[data-item]').nth(index)).toHaveAttribute('data-size', String(item.size));
  }
}

const item = (id: string) => `[data-item="${id}"]`;

forEachBand(activity.bands, (band) => {
  test('picks the bigger or smaller picture, and a wrong pick steps back', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.mode).toBe('pick');

    await expectRoundShows(page, level);
    const instruction =
      level.items.length === 2
        ? level.direction === 'big'
          ? strings.bigger
          : strings.smaller
        : level.direction === 'big'
          ? strings.biggest
          : strings.smallest;
    await expectInstructionSpoken(page, instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [answer] = level.answer;
    const wrong = level.items.find((each) => each.id !== answer);
    if (wrong === undefined) throw new Error('A round always has two pictures');
    await page.locator(item(wrong.id)).click();
    await expect(page.locator(item(wrong.id))).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(item(answer)).click();
    await expect(page.locator(item(answer))).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('lines the pictures up by size, one click at a time', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: ORDER_DIFFICULTY });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), ORDER_DIFFICULTY, band);
    expect(level.mode).toBe('order');
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, level.direction === 'small' ? strings.smallToBig : strings.bigToSmall);
    await saveBandScreenshot(page, band, `${activity.id}-order`);

    // The last picture in order is never the first to click.
    const last = level.answer.at(-1);
    if (last === undefined) throw new Error('An order round has pictures');
    await page.locator(item(last)).click();
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator('[data-lined]')).toHaveCount(0);

    for (const [index, id] of level.answer.entries()) {
      await page.locator(item(id)).click();
      await expect(page.locator('[data-lined]')).toHaveCount(index + 1);
      await expect(page.locator('[data-lined]').nth(index)).toHaveAttribute('data-lined', id);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
    await saveBandScreenshot(page, band, `${activity.id}-lined`);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const [answer] = level.answer;
    await tabTo(page, item(answer));
    await page.keyboard.press('Enter');
    await expect(page.locator(item(answer))).toHaveAttribute('data-answer', 'true');
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
        targets: ['[data-item]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
