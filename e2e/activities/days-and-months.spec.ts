import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { t } from '../../src/core/strings/defineStrings.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/days-and-months/activity.ts';
import {
  generateLevel,
  type DaysAndMonthsLevel,
  type OrderRound,
} from '../../src/features/early-learning/activities/days-and-months/level.ts';
import { nameOf } from '../../src/features/early-learning/activities/days-and-months/names.ts';
import { strings } from '../../src/features/early-learning/activities/days-and-months/strings.ts';
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
import { dragTo } from '../support/sorting.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** The first session seed from SEED whose first round at `difficulty` is an order round. */
function orderSeed(difficulty: number): { seed: number; level: OrderRound } {
  for (let seed = SEED; seed < SEED + 200; seed += 1) {
    const level = generateLevel(roundSeed(seed, 0), difficulty, 'band-6-8');
    if (level.mode === 'order') return { seed, level };
  }
  throw new Error('No order round near the seed.');
}

async function expectRoundShows(page: Page, level: DaysAndMonthsLevel): Promise<void> {
  await expect(page.locator('.dm-stage')).toHaveAttribute('data-mode', level.mode);
  if (level.mode === 'order') {
    await expect(page.locator('[data-tile]')).toHaveText(level.tiles.map((index) => t(nameOf(level.cycle, index))));
  } else {
    await expect(page.locator('[data-choice]')).toHaveText(level.choices.map((index) => t(nameOf(level.cycle, index))));
  }
}

const tile = (index: number) => `[data-tile="${String(index)}"]`;
const box = (place: number) => `[data-box="${String(place)}"]`;

forEachBand(activity.bands, (band) => {
  test('answers what comes after: a wrong name steps back and the right one fills the gap', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    if (level.mode === 'order') throw new Error('The easiest round is a question');

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.dayAfter);
    await expect.poll(() => spokenIds(page)).toContain(nameOf(level.cycle, level.given).id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((choice) => choice !== level.answer);
    if (wrong === undefined) throw new Error('A round always has a wrong answer');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${String(level.answer)}"]`).click();
    await expect(page.locator('[data-gap]')).toHaveText(t(nameOf(level.cycle, level.answer)));
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('puts days in order by dragging, and a name in the wrong box goes back', async () => {
    const { seed, level } = orderSeed(3);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty: 3 });
    const { page } = launched;
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, level.cycle === 'days' ? strings.orderDays : strings.orderMonths);
    await saveBandScreenshot(page, band, `${activity.id}-order`);
    await expectAccessible(page);

    const second = level.run[1];
    if (second === undefined) throw new Error('A run has more than one name');
    await dragTo(page, tile(second), box(0));
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator(box(0))).toHaveAttribute('data-filled', 'false');

    for (const [place, index] of level.run.entries()) {
      await dragTo(page, tile(index), box(place));
      await expect(page.locator(box(place))).toHaveText(t(nameOf(level.cycle, index)));
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-ordered`);
  });

  test('click to place: clicks a name to pick it up and clicks its box to put it down', async () => {
    const { seed, level } = orderSeed(4);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty: 4 });
    const { page } = launched;
    await expectRoundShows(page, level);
    for (const [place, index] of level.run.entries()) {
      await page.locator(tile(index)).click();
      await expect(page.locator(tile(index))).toHaveAttribute('data-carried', 'true');
      await page.locator(box(place)).click();
      await expect(page.locator(box(place))).toHaveText(t(nameOf(level.cycle, index)));
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { seed, level } = orderSeed(6);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty: 6 });
    const { page } = launched;
    await expectRoundShows(page, level);
    for (const [place, index] of level.run.entries()) {
      await tabTo(page, tile(index));
      await expect.poll(() => spokenIds(page)).toContain(nameOf(level.cycle, index).id);
      // Enter picks the name up over the first empty box, which is its box when filling in order.
      await page.keyboard.press('Enter');
      await expect(page.locator(box(place))).toHaveAttribute('data-carry-over', 'true');
      await page.keyboard.press('Enter');
      await expect(page.locator(box(place))).toHaveText(t(nameOf(level.cycle, index)));
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const { seed, level } = orderSeed(max);
    await expectTargetsFit(
      {
        activity,
        band,
        seed,
        difficulty: max,
        targets: ['[data-tile]', '[data-box]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
