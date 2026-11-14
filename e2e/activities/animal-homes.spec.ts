import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { emojiNames } from '../../src/core/strings/shared/index.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/animal-homes/activity.ts';
import {
  generateLevel,
  type AnimalHomesLevel,
} from '../../src/features/early-learning/activities/animal-homes/level.ts';
import { strings } from '../../src/features/early-learning/activities/animal-homes/strings.ts';
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

async function expectRoundShows(page: Page, level: AnimalHomesLevel): Promise<void> {
  await expect(page.locator('[data-animal]')).toHaveCount(level.animals.length);
  for (const [index, home] of level.homes.entries()) {
    await expect(page.locator('[data-home]').nth(index)).toHaveAttribute('data-home', home);
  }
}

const animal = (id: string) => `[data-animal="${id}"]`;
const home = (id: string) => `[data-home="${id}"]`;

forEachBand(activity.bands, (band) => {
  test('takes every animal home, and an animal at the wrong home goes back', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [first] = level.animals;
    if (first === undefined) throw new Error('A round always has animals');
    await page.locator(animal(first.id)).hover();
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[first.id].id);
    const other = level.homes.find((each) => each !== first.home);
    if (other === undefined) throw new Error('A round always has two homes');
    await dragTo(page, animal(first.id), home(other));
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator(animal(first.id))).toBeVisible();
    await expect(page.locator(home(other))).toHaveAttribute('data-filled', 'false');

    for (const each of level.animals) {
      await dragTo(page, animal(each.id), home(each.home));
      await expect(page.locator(`${home(each.home)} [data-resident="${each.id}"]`)).toBeVisible();
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-home`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks an animal to pick it up and clicks its home to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const each of level.animals) {
      await page.locator(animal(each.id)).click();
      await expect(page.locator(animal(each.id))).toHaveAttribute('data-carried', 'true');
      await page.locator(home(each.home)).click();
      await expect(page.locator(`${home(each.home)} [data-resident="${each.id}"]`)).toBeVisible();
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await expectRoundShows(page, level);
    const free = [...level.homes];
    for (const each of level.animals) {
      await tabTo(page, animal(each.id));
      await expect.poll(() => spokenIds(page)).toContain(emojiNames[each.id].id);
      // The arrow keys move over the homes still empty, in screen order.
      await carryWithKeys(page, free.indexOf(each.home));
      await expect(page.locator(`${home(each.home)} [data-resident="${each.id}"]`)).toBeVisible();
      free.splice(free.indexOf(each.home), 1);
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
        targets: ['[data-animal]', '[data-home]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
