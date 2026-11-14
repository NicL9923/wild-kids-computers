import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { colors } from '../../src/core/strings/shared/index.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/color-match/activity.ts';
import { generateLevel, type ColorMatchLevel } from '../../src/features/early-learning/activities/color-match/level.ts';
import { strings } from '../../src/features/early-learning/activities/color-match/strings.ts';
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
import { carryWithKeys, dragTo } from '../support/sorting.ts';
import { ACTIVITY_PATH } from '../../src/activityShell/paths.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: ColorMatchLevel): Promise<void> {
  await expect(page.locator('[data-toy]')).toHaveCount(level.toys.length);
  await expect(page.locator('[data-box]')).toHaveCount(level.boxes.length);
  for (const [index, color] of level.boxes.entries()) {
    await expect(page.locator('[data-box]').nth(index)).toHaveAttribute('data-box', color);
  }
}

const toy = (id: string) => `[data-toy="${id}"]`;
const box = (color: string) => `[data-box="${color}"]`;

forEachBand(activity.bands, (band) => {
  test('sorts every toy into the box of its color, and a toy in another box goes home', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [first] = level.toys;
    if (first === undefined) throw new Error('A round always has toys');
    // A toy says its color under the pointer.
    await page.locator(toy(first.id)).hover();
    await expect.poll(() => spokenIds(page)).toContain(colors[first.color].id);

    const other = level.boxes.find((color) => color !== first.color);
    if (other === undefined) throw new Error('A round always has two boxes');
    await dragTo(page, toy(first.id), box(other));
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator(toy(first.id))).toBeVisible();
    await expect(page.locator(`${box(other)} [data-in-box]`)).toHaveCount(0);

    for (const each of level.toys) {
      await dragTo(page, toy(each.id), box(each.color));
      await expect(page.locator(`${box(each.color)} [data-in-box="${each.id}"]`)).toBeVisible();
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-sorted`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a toy to pick it up and clicks its box to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const each of level.toys) {
      await page.locator(toy(each.id)).click();
      await expect(page.locator(toy(each.id))).toHaveAttribute('data-carried', 'true');
      await page.locator(box(each.color)).click();
      await expect(page.locator(`${box(each.color)} [data-in-box="${each.id}"]`)).toBeVisible();
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    for (const each of level.toys) {
      await tabTo(page, toy(each.id));
      await expect.poll(() => spokenIds(page)).toContain(colors[each.color].id);
      await carryWithKeys(page, level.boxes.indexOf(each.color));
      await expect(page.locator(`${box(each.color)} [data-in-box="${each.id}"]`)).toBeVisible();
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('adds a pattern to every color with the switch, and keeps it for the next visit', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    await expect(page.locator('.cm-stage')).toHaveAttribute('data-patterns', 'false');
    await page.locator('[data-control="patterns"]').click();
    await expect(page.locator('[data-control="patterns"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cm-stage')).toHaveAttribute('data-patterns', 'true');
    // Every box now carries its pattern over its paint.
    await expect(page.locator('[data-box] path[fill^="url(#cm-pattern-"]')).toHaveCount(
      generateLevel(roundSeed(SEED, 0), max, band).boxes.length,
    );
    await saveBandScreenshot(page, band, `${activity.id}-patterns`);
    // Leaving and coming back keeps the patterns on.
    await page.locator('[data-control="exit"]').click();
    await page.evaluate(
      (hash) => {
        window.location.hash = hash;
      },
      `#${ACTIVITY_PATH(activity.id)}`,
    );
    await expect(page.locator('.cm-stage')).toHaveAttribute('data-patterns', 'true');
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
        targets: ['[data-toy]', '[data-box]', '[data-control="patterns"]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
