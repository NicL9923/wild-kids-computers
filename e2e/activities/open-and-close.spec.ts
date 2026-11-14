import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/open-and-close/activity.ts';
import { generateLevel } from '../../src/features/toy-desktop/lessons/open-and-close/level.ts';
import { strings } from '../../src/features/toy-desktop/lessons/open-and-close/strings.ts';
import type { AppKind } from '../../src/features/toy-desktop/model/state.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import {
  clickCenter,
  desktopIcon,
  saveReviewScreenshot,
  smallestTargets,
  windowControl,
  windowOf,
} from '../support/toyDesktop.ts';

const SEED = 5_150;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const OPEN: Readonly<Record<AppKind, SpokenHandle | undefined>> = {
  notepad: strings.openNotepad,
  'picture-viewer': strings.openPictureViewer,
  'file-explorer': strings.openFileExplorer,
  'music-box': strings.openMusicBox,
  calculator: strings.openCalculator,
  settings: undefined,
};

const TARGET_MIN = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 } as const;

function range(band: (typeof activity.bands)[number]): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('open-and-close is a rounds activity');
  const found = activity.difficulty[band];
  if (found === undefined) throw new Error(`open-and-close has no range for ${band}`);
  return found;
}

forEachBand(activity.bands, (band) => {
  test('opens the named app from its icon, closes its window, and the next round starts', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min + 1 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min + 1, band);
    const next = generateLevel(roundSeed(SEED, 1), min + 1, band);
    const open = OPEN[level.app];
    if (open === undefined) throw new Error(`No instruction for ${level.app}`);

    await expect(page.locator('[data-desktop-icon]')).toHaveCount(level.icons.length);
    await expectInstructionSpoken(page, open);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // One click on the named app's icon opens its window, and the instruction turns to closing.
    await clickCenter(page, desktopIcon(page, `app:${level.app}`));
    const opened = windowOf(page, level.app);
    await expect(opened).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.close.id);
    await expectInstructionSpoken(page, strings.close);
    await saveReviewScreenshot(page, band, `${activity.id}-open`);
    await expectAccessible(page);

    await clickCenter(page, windowControl(opened, 'close'));
    await expect(page.locator(`[data-window][data-app="${level.app}"]`)).toHaveCount(0);
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').last()).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);

    // The next round's desktop comes from the next round seed.
    await expect(page.locator('[data-lesson-step="0"] [data-desktop-icon]')).toHaveCount(next.icons.length);
    await expect(desktopIcon(page, `app:${next.app}`)).toBeVisible();
  });

  test('two wrong tries get a gentle nudge each, then the right icon is pointed out', async () => {
    const { min } = range(band);
    // Enough icons that there is a wrong one to try.
    const difficulty = min + 1;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    const other = level.icons.find((app) => app !== level.app);
    if (other === undefined) throw new Error('The level has only one icon');
    const target = desktopIcon(page, `app:${level.app}`);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await clickCenter(page, desktopIcon(page, `app:${other}`));
      const wrong = windowOf(page, other);
      await expect(wrong).toBeVisible();
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
      // Closing the wrong window is not another mistake; the child just carries on.
      await clickCenter(page, windowControl(wrong, 'close'));
      await expect(page.locator(`[data-window][data-app="${other}"]`)).toHaveCount(0);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(target).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await clickCenter(page, target);
    await expect(windowOf(page, level.app)).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expect(page.locator('[data-desktop-icon]')).toHaveCount(level.icons.length);
    for (let presses = 0; presses < 30; presses += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-desktop-icon') ?? null);
      if (focused === `app:${level.app}`) break;
    }
    await expect(desktopIcon(page, `app:${level.app}`)).toBeFocused();
    await page.keyboard.press('Enter');
    const opened = windowOf(page, level.app);
    await expect(opened).toBeVisible();
    for (let presses = 0; presses < 30; presses += 1) {
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-window-control') ?? null);
      if (focused === 'close') break;
      await page.keyboard.press('Shift+Tab');
    }
    await expect(windowControl(opened, 'close')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-window][data-app="${level.app}"]`)).toHaveCount(0);
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = range(band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expect(page.locator('[data-desktop-icon]')).toHaveCount(level.icons.length);
      await expect(page.locator('[data-window]')).toHaveCount(level.openApps.length);
      for (const smallest of await smallestTargets(page, '[data-desktop-icon], [data-window-control]')) {
        expect(smallest).toBeGreaterThanOrEqual(TARGET_MIN[band] - 0.5);
      }
      // Every icon is fully on the toy screen, never under a window.
      const desktop = await page.locator('.td-desktop').boundingBox();
      if (desktop === null) throw new Error('The desktop is missing');
      for (const icon of await page.locator('[data-desktop-icon]').all()) {
        const box = await icon.boundingBox();
        if (box === null) throw new Error('An icon is missing');
        expect(box.y + box.height).toBeLessThanOrEqual(desktop.y + desktop.height + 0.5);
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-desktop-icon]') !== null,
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        );
        expect(hit).toBe(true);
      }
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
