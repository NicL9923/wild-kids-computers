import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { shapes } from '../../src/core/strings/shared/index.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/shape-sorter/activity.ts';
import {
  generateLevel,
  type ShapeSorterLevel,
} from '../../src/features/early-learning/activities/shape-sorter/level.ts';
import { strings } from '../../src/features/early-learning/activities/shape-sorter/strings.ts';
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

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: ShapeSorterLevel): Promise<void> {
  await expect(page.locator('[data-piece]')).toHaveCount(level.pieces.length);
  for (const [index, shape] of level.holes.entries()) {
    await expect(page.locator('[data-hole]').nth(index)).toHaveAttribute('data-hole', shape);
  }
}

const piece = (id: string) => `[data-piece="${id}"]`;
const hole = (shape: string) => `[data-hole="${shape}"]`;

forEachBand(activity.bands, (band) => {
  test('drops every shape into its own hole, and a shape in another hole goes home', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [first] = level.pieces;
    if (first === undefined) throw new Error('A round always has shapes');
    await page.locator(piece(first.id)).hover();
    await expect.poll(() => spokenIds(page)).toContain(shapes[first.shape].id);
    const other = level.holes.find((shape) => shape !== first.shape);
    if (other === undefined) throw new Error('A round always has two holes');
    await dragTo(page, piece(first.id), hole(other));
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator(piece(first.id))).toBeVisible();
    await expect(page.locator(hole(other))).toHaveAttribute('data-filled', 'false');

    for (const each of level.pieces) {
      await dragTo(page, piece(each.id), hole(each.shape));
      await expect(page.locator(hole(each.shape))).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-sorted`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a shape to pick it up and clicks its hole to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const each of level.pieces) {
      await page.locator(piece(each.id)).click();
      await expect(page.locator(piece(each.id))).toHaveAttribute('data-carried', 'true');
      await page.locator(hole(each.shape)).click();
      await expect(page.locator(hole(each.shape))).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await expectRoundShows(page, level);
    const free = [...level.holes];
    for (const each of level.pieces) {
      await tabTo(page, piece(each.id));
      await expect.poll(() => spokenIds(page)).toContain(shapes[each.shape].id);
      // The arrow keys move over the holes still empty, in screen order.
      await carryWithKeys(page, free.indexOf(each.shape));
      await expect(page.locator(hole(each.shape))).toHaveAttribute('data-filled', 'true');
      free.splice(free.indexOf(each.shape), 1);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
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
        targets: ['[data-piece]', '[data-hole]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
