import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/switch-windows/activity.ts';
import { generateLevel, type SwitchLevel } from '../../src/features/toy-desktop/lessons/switch-windows/level.ts';
import { FIND } from '../../src/features/toy-desktop/lessons/switch-windows/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/switch-windows/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot, smallestTargets, windowControl } from '../support/toyDesktop.ts';

const SEED = 7_340;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const targetId = (level: SwitchLevel) => level.targetWindow;
const task = (page: Page, windowId: string) => page.locator(`[data-task-window="${windowId}"]`);
const windowById = (page: Page, windowId: string) => page.locator(`[data-window="${windowId}"]`);

forEachBand(activity.bands, (band) => {
  test('brings the hidden window to the front from the task strip, makes it fill the screen, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const windowId = targetId(level);
    await expect(page.locator('[data-task-window]')).toHaveCount(level.apps.length);
    await expectInstructionSpoken(page, FIND[level.target]);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await clickCenter(page, task(page, windowId));
    await expect(windowById(page, windowId)).toHaveAttribute('data-focused', 'true');
    await expect.poll(() => spokenIds(page)).toContain(strings.maximize.id);
    await clickCenter(page, windowControl(windowById(page, windowId), 'maximize'));
    await expect(windowById(page, windowId)).toHaveAttribute('data-maximized', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
    await saveReviewScreenshot(page, band, `${activity.id}-done`);

    const next = generateLevel(roundSeed(SEED, 1), min, band);
    await expect(page.locator('[data-lesson-step="0"] [data-task-window]')).toHaveCount(next.apps.length);
  });

  test('two wrong picks in the strip get a nudge, then the right button is pointed out', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const windowId = targetId(level);
    const front = level.desktop.windows.at(-1)?.id;
    const others = level.desktop.windows.map((each) => each.id).filter((id) => id !== windowId && id !== front);
    await expect(windowById(page, front ?? 'none')).toHaveAttribute('data-maximized', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hard`);
    for (const other of others.slice(0, 2)) {
      await clickCenter(page, task(page, other));
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
    }
    await expect.poll(() => spokenIds(page)).toContain(strings.lookAtStrip.id);
    await expect(task(page, windowId)).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);

    await clickCenter(page, task(page, windowId));
    await clickCenter(page, windowControl(windowById(page, windowId), 'maximize'));
    await expect.poll(() => spokenIds(page)).toContain(strings.minimize.id);
    await clickCenter(page, windowControl(windowById(page, windowId), 'minimize'));
    await expect(task(page, windowId)).toHaveAttribute('data-minimized', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min + 2 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min + 2, band);
    const windowId = targetId(level);
    await tabTo(page, task(page, windowId));
    await page.keyboard.press('Enter');
    await expect(windowById(page, windowId)).toHaveAttribute('data-focused', 'true');
    // Focus is in the window now: its title bar and buttons come next.
    await tabTo(page, windowControl(windowById(page, windowId), 'maximize'));
    await page.keyboard.press('Enter');
    await expect(windowById(page, windowId)).toHaveAttribute('data-maximized', 'true');
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expect(page.locator('[data-task-window]')).toHaveCount(level.apps.length);
      for (const smallest of await smallestTargets(page, '[data-task-window], [data-window-control]')) {
        expect(smallest).toBeGreaterThanOrEqual(band === 'band-6-8' ? 55.5 : 43.5);
      }
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
