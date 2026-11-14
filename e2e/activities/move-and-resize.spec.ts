import { expect, test } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/move-and-resize/activity.ts';
import { generateLevel } from '../../src/features/toy-desktop/lessons/move-and-resize/level.ts';
import { strings } from '../../src/features/toy-desktop/lessons/move-and-resize/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { saveReviewScreenshot, titleBar, windowOf } from '../support/toyDesktop.ts';
import { carryByClicks, desktopScale, dragBy, windowCorner } from '../support/toyDesktopLessons.ts';

const SEED = 6_120;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

forEachBand(activity.bands, (band) => {
  test('click to place: moves the window into the box, resizes it to fit, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const window = windowOf(page, 'picture-viewer');
    await expect(page.locator('[data-mark="place"]')).toBeVisible();
    await expectInstructionSpoken(page, strings.instruction);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const scale = await desktopScale(page);
    const by = { x: (level.place.x - level.start.x) * scale, y: (level.place.y - level.start.y) * scale };
    await carryByClicks(page, titleBar(window), by);
    const corner = await windowCorner(page, window);
    expect(Math.abs(corner.x - level.place.x)).toBeLessThanOrEqual(level.tolerance);
    expect(Math.abs(corner.y - level.place.y)).toBeLessThanOrEqual(level.tolerance);

    // The box changes to the outline, and the instruction turns to resizing.
    await expect(page.locator('[data-mark="outline"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.resize.id);
    await saveReviewScreenshot(page, band, `${activity.id}-resize`);
    const grow = {
      x: (level.outline.width - level.place.width) * scale,
      y: (level.outline.height - level.place.height) * scale,
    };
    await carryByClicks(page, window.locator('.td-resize'), grow);
    const box = await window.boundingBox();
    if (box === null) throw new Error('The window left the screen.');
    expect(Math.abs(box.width / scale - level.outline.width)).toBeLessThanOrEqual(level.tolerance);
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').last()).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);

    // The next round starts with its own box, from the next round seed.
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    await expect(page.locator('[data-lesson-step="0"] [data-mark="place"]')).toBeVisible();
    await expect
      .poll(async () => Math.round((await windowCorner(page, windowOf(page, 'picture-viewer'))).x))
      .toBe(next.start.x);
  });

  test('a drag works too, and two misses point at the title bar', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const window = windowOf(page, 'picture-viewer');
    const scale = await desktopScale(page);
    // Two small drags that land short of the box: each is a gentle try.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dragBy(page, titleBar(window), { x: 30 * Math.sign(level.place.x - level.start.x) || 30, y: 0 });
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
    }
    await expect.poll(() => spokenIds(page)).toContain(strings.moveCloser.id);
    await expect(titleBar(window)).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    const now = await windowCorner(page, window);
    await dragBy(page, titleBar(window), { x: (level.place.x - now.x) * scale, y: (level.place.y - now.y) * scale });
    await expect(page.locator('[data-mark="outline"]')).toBeVisible();
    await expect(titleBar(window)).toHaveAttribute('data-highlight', 'false');
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const window = windowOf(page, 'picture-viewer');
    const scale = await desktopScale(page);
    // The carry moves 24 pixels per arrow key.
    const presses = (units: number) => Math.round((units * scale) / 24);
    async function carry(item: ReturnType<typeof titleBar>, dx: number, dy: number) {
      await item.focus();
      await page.keyboard.press('Enter');
      await expect(item).toHaveAttribute('data-carried', 'true');
      for (let index = 0; index < Math.abs(presses(dx)); index += 1) {
        await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      for (let index = 0; index < Math.abs(presses(dy)); index += 1) {
        await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      await page.keyboard.press('Enter');
    }
    await carry(titleBar(window), level.place.x - level.start.x, level.place.y - level.start.y);
    await expect(page.locator('[data-mark="outline"]')).toBeVisible();
    await carry(
      window.locator('.td-resize'),
      level.outline.width - level.place.width,
      level.outline.height - level.place.height,
    );
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('keeps both boxes and the window in view at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const scale = await desktopScale(page);
      const mark = await page.locator('[data-mark="place"]').boundingBox();
      const desktop = await page.locator('.td-desktop').boundingBox();
      if (mark === null || desktop === null) throw new Error('The box is missing');
      expect(mark.x + mark.width).toBeLessThanOrEqual(desktop.x + desktop.width);
      expect(mark.y + mark.height).toBeLessThanOrEqual(desktop.y + desktop.height);
      expect(Math.round(mark.width / scale)).toBe(level.place.width);
      const handle = await windowOf(page, 'picture-viewer').locator('.td-resize').boundingBox();
      expect(Math.min(handle?.width ?? 0, handle?.height ?? 0)).toBeGreaterThanOrEqual(
        band === 'band-6-8' ? 55.5 : 43.5,
      );
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
