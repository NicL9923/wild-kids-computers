import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { letterNames, numbers } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/any-key-party/activity.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/any-key-party/level.ts';
import { strings } from '../../src/features/computer-skills/activities/any-key-party/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const stage = (page: Page) => page.locator('.party-stage');

/** Waits for the friends' arrival animations, so a screenshot shows them settled. */
const settled = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

forEachBand(activity.bands, (band) => {
  test('every key brings a friend, letters and digits say their names, and a full meadow ends the round', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 2 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 2, band);
    await expect(stage(page)).toHaveAttribute('data-arrived', '0');
    await saveBandScreenshot(page, band, activity.id, 'empty');

    const keys = ['b', '7', 'Space', 'Tab', 'Shift'];
    expect(keys).toHaveLength(level.friends.length);
    for (const [index, key] of keys.entries()) {
      await page.keyboard.press(key);
      await expect(stage(page)).toHaveAttribute('data-arrived', String(index + 1));
      await expect(page.locator(`[data-friend="${level.friends[index]?.id ?? ''}"]`)).toBeVisible();
    }
    const spoken = await spokenIds(page);
    expect(spoken).toContain(letterNames.b.id);
    expect(spoken).toContain(numbers['7'].id);
    expect((await readAudioLog(page)).some((entry) => entry.kind === 'sfx' && entry.name === 'pop')).toBe(true);
    // Tab is a party key here, so focus stayed on the meadow and did not move to a control.
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-key-area'))).toBe(true);
    await settled(page);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    await expect(stage(page)).toHaveAttribute('data-arrived', '0');
    await expect(stage(page)).toHaveAttribute('data-full', 'false');
  });

  test('Escape hands the keyboard back to the page, and the replay control speaks the instruction', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    await expect(stage(page)).toHaveAttribute('data-arrived', '0');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-control'))).toBe('replay');
    // Escape is not a party key: no friend came.
    await expect(stage(page)).toHaveAttribute('data-arrived', '0');
    await expectInstructionSpoken(page, strings.instruction);
    // A letter on the focused control still parties; Enter there presses the control instead.
    await page.keyboard.press('m');
    await expect(stage(page)).toHaveAttribute('data-arrived', '1');
    // Tab comes back to the meadow, where Space brings a friend again.
    await tabTo(page, page.locator('[data-key-area]'));
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('data-arrived', '2');
  });

  test('a click on the meadow says once to use the keys', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    await page.locator('.party-meadow').click();
    await page.locator('.party-meadow').click();
    await expect.poll(async () => (await spokenIds(page)).filter((id) => id === strings.useKeys.id)).toHaveLength(1);
    await expect(stage(page)).toHaveAttribute('data-arrived', '0');
  });

  test('a full meadow fits at both review sizes', async () => {
    const level = generateLevel(roundSeed(SEED, 0), 4, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 4, size });
      const { page } = launched;
      await expect(stage(page)).toHaveAttribute('data-arrived', '0');
      for (let press = 0; press < level.friends.length - 1; press += 1) await page.keyboard.press('a');
      await expect(page.locator('[data-friend]')).toHaveCount(level.friends.length - 1);
      for (const box of await page
        .locator('[data-friend]')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().bottom))) {
        expect(box).toBeLessThanOrEqual(size.height);
      }
      await settled(page);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
