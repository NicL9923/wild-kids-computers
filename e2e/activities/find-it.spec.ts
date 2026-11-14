import { expect, test, type Locator } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/find-it/activity.ts';
import { generateLevel, TARGETS, type FindItLevel } from '../../src/features/toy-desktop/lessons/find-it/level.ts';
import { FIND } from '../../src/features/toy-desktop/lessons/find-it/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/find-it/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, saveReviewScreenshot, windowOf } from '../support/toyDesktop.ts';
import { expectTargetsAtLeast, lessonRange } from '../support/toyLessons.ts';

const SEED = 10_450;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function nameOf(level: FindItLevel): string {
  const name = TARGETS[level.target]?.name;
  if (name === undefined) throw new Error('The level names no file');
  return name;
}

const search = (explorer: Locator) => explorer.locator('input[data-text-field="search"]');
const item = (explorer: Locator, name: string) => explorer.locator(`[data-item="${name}"]`);

forEachBand(activity.bands, (band) => {
  test('types the name in the search box and opens the file it finds', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const name = nameOf(level);
    const explorer = windowOf(page, 'file-explorer');
    const instruction = FIND[level.target];
    if (instruction === undefined) throw new Error('No instruction for the file');

    // The file is hidden in a folder, so home does not show it.
    await expect(explorer.locator('.td-item').first()).toBeVisible();
    await expect(item(explorer, name)).toHaveCount(0);
    await expectInstructionSpoken(page, instruction);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await clickCenter(page, search(explorer));
    await page.keyboard.type(name);
    await expect(item(explorer, name)).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.openIt.id);
    await saveReviewScreenshot(page, band, `${activity.id}-found`);
    await expectAccessible(page);

    await clickCenter(page, item(explorer, name).locator('.td-item-open'));
    await expect(page.locator('[data-window][data-focused="true"]')).not.toHaveAttribute('data-app', 'file-explorer');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('opening a look-alike gets a nudge each time, then the right file is pointed out', async () => {
    const { max } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const name = nameOf(level);
    const firstWord = name.split(' ')[0] ?? name;
    const explorer = windowOf(page, 'file-explorer');
    await clickCenter(page, search(explorer));
    await page.keyboard.type(firstWord);
    // The first word finds the file and its look-alikes.
    await expect(item(explorer, name)).toBeVisible();
    const others = explorer.locator(`.td-item:not([data-item="${name}"])`);
    await expect(others).toHaveCount(2);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await clickCenter(page, others.nth(attempt).locator('.td-item-open'));
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(attempt + 1);
      await clickCenter(page, page.locator('[data-window][data-focused="true"] [data-window-control="close"]'));
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(item(explorer, name).locator('.td-item-open')).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const name = nameOf(level);
    const explorer = windowOf(page, 'file-explorer');
    const box = search(explorer);
    for (let presses = 0; presses < 30; presses += 1) {
      if (await box.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(box).toBeFocused();
    await page.keyboard.type(name);
    const found = item(explorer, name).locator('.td-item-open');
    for (let presses = 0; presses < 30; presses += 1) {
      if (await found.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = lessonRange(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const explorer = windowOf(page, 'file-explorer');
      await expect(search(explorer)).toBeVisible();
      await expectTargetsAtLeast(page, band, '[data-desktop-icon], [data-explorer-command], .td-item-open, .td-place');
      await expectTargetsAtLeast(page, band, 'input[data-text-field="search"]');
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
