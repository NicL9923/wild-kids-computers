import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import { numberHandle } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/early-learning/activities/count-the-flowers/activity.ts';
import {
  generateLevel,
  type FlowersLevel,
} from '../../src/features/early-learning/activities/count-the-flowers/level.ts';
import { strings } from '../../src/features/early-learning/activities/count-the-flowers/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** The lowest difficulty of the band, where every child starts. */
function startOf(band: (typeof activity.bands)[number]): number {
  if (activity.kind !== 'rounds') throw new Error('count-the-flowers is a rounds activity');
  return activity.difficulty[band]?.min ?? 1;
}

async function expectRoundShows(page: Page, level: FlowersLevel): Promise<void> {
  await expect(page.locator('[data-flower]')).toHaveCount(level.count);
  await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
}

forEachBand(activity.bands, (band) => {
  test('counts the flowers out loud, sets a wrong number aside, and the right number ends the round', async () => {
    const start = startOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: start });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), start, band);
    const next = generateLevel(roundSeed(SEED, 1), start, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expectRoundShows(page, level);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Touching each flower counts it: its number appears on it and is spoken.
    for (const [index, flower] of level.flowers.entries()) {
      const at = await centerOf(page, `[data-flower="${flower.id}"]`);
      await page.mouse.click(at.x, at.y);
      await expect(page.locator(`[data-flower="${flower.id}"] [data-counted]`)).toHaveText(String(index + 1));
    }
    await expect.poll(() => spokenIds(page)).toContain(numberHandle(level.count).id);

    // A wrong number is set aside with a neutral line, and the round goes on.
    const wrong = level.choices.find((choice) => choice !== level.count);
    if (wrong === undefined) throw new Error('A round always offers a wrong number');
    await page.locator(`[data-choice="${String(wrong)}"]`).click();
    await expect(page.locator(`[data-choice="${String(wrong)}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator('[data-flower]')).toHaveCount(level.count);

    await page.locator(`[data-choice="${String(level.count)}"]`).click();
    await expect(page.locator(`[data-choice="${String(level.count)}"]`)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.thatsIt.id);
    await saveBandScreenshot(page, band, `${activity.id}-answered`);

    // The next round comes from the next round seed.
    await expectRoundShows(page, next);
  });

  test('can be played with the keyboard alone', async () => {
    const start = startOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: start });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), start, band);
    await expectRoundShows(page, level);
    // Tab through the screen until the right number has focus, then press Enter.
    for (let presses = 0; presses < 40; presses += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-choice') ?? null);
      if (focused === String(level.count)) break;
    }
    await expect(page.locator(`[data-choice="${String(level.count)}"]`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-choice="${String(level.count)}"]`)).toHaveAttribute('data-answer', 'true');
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    if (activity.kind !== 'rounds') throw new Error('count-the-flowers is a rounds activity');
    const hardest = activity.difficulty[band]?.max ?? 1;
    const level = generateLevel(roundSeed(SEED, 0), hardest, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: hardest, size });
      const { page } = launched;
      await expectRoundShows(page, level);
      for (const selector of ['[data-flower]', '[data-choice]']) {
        const boxes = await page.locator(selector).evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height, bottom: rect.bottom };
          }),
        );
        for (const box of boxes) {
          // Every target is on screen and at least the band's smallest target.
          expect(box.bottom).toBeLessThanOrEqual(size.height);
          expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
        }
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
