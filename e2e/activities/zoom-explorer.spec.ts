import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { emojiNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/zoom-explorer/activity.ts';
import { generateLevel, type Thing } from '../../src/features/computer-skills/activities/zoom-explorer/level.ts';
import { strings } from '../../src/features/computer-skills/activities/zoom-explorer/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`zoom-explorer serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.zoom-stage');
const thingAt = (page: Page, thing: Thing) => page.locator(`[data-thing="${thing.id}"]`);

async function centerOf(page: Page, thing: Thing): Promise<{ x: number; y: number }> {
  const box = await thingAt(page, thing).boundingBox();
  if (box === null) throw new Error(`${thing.id} is not on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Rolls the wheel with Control held over `at`, one notch per step, as a mouse would. */
async function controlWheel(page: Page, at: { x: number; y: number }, notches: number): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  for (let notch = 0; notch < Math.abs(notches); notch += 1) await page.mouse.wheel(0, notches > 0 ? -100 : 100);
  await page.keyboard.up('Control');
}

forEachBand(activity.bands, (band) => {
  test('zooms in on each tiny thing to catch it, then zooms all the way out', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const targets = level.things.filter((thing) => thing.isTarget);
    await expect(stage(page)).toHaveAttribute('data-zoom-step', '0');
    await expectInstructionSpoken(page, strings.findTiny);
    // The thing's name follows the first clip, so it is logged only once that clip ends.
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[level.target].id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);
    const width = await page.evaluate(() => window.innerWidth);

    for (const target of targets) {
      // The wheel zooms around the pointer, so the thing stays under it as it grows.
      await controlWheel(page, await centerOf(page, target), level.catchStep);
      await expect(stage(page)).toHaveAttribute('data-zoom-step', String(level.catchStep));
      const box = await thingAt(page, target).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(56);
      await thingAt(page, target).click();
      await expect(thingAt(page, target)).toHaveAttribute('data-found', 'true');
      if (target !== targets.at(-1)) {
        // Back out with the minus key to look for the next one.
        for (let step = 0; step < level.catchStep; step += 1) await page.keyboard.press('-');
        await expect(stage(page)).toHaveAttribute('data-zoom-step', '0');
      }
    }
    await saveBandScreenshot(page, band, activity.id, 'zoomed');
    await expect(stage(page)).toHaveAttribute('data-all-found', 'true');
    await expect.poll(() => spokenIds(page)).toContain(strings.zoomOut.id);
    // Only the picture zoomed: the window's own size and scale did not change.
    expect(await page.evaluate(() => [window.innerWidth, window.visualViewport?.scale])).toEqual([width, 1]);

    const minus = page.locator('[data-zoom="out"]');
    for (let step = 0; step < level.catchStep; step += 1) await minus.click();
    await expect(stage(page)).toHaveAttribute('data-done', 'true');
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
  });

  test('a tiny thing clicked before zooming asks to zoom closer, and a look-alike gets a nudge', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const target = level.things.find((thing) => thing.isTarget);
    const other = level.things.find((thing) => !thing.isTarget);
    if (target === undefined || other === undefined) throw new Error('A level has both kinds');
    await thingAt(page, target).click();
    await expect.poll(() => spokenIds(page)).toContain(strings.tooSmall.id);
    await expect(thingAt(page, target)).toHaveAttribute('data-found', 'false');

    const plus = page.locator('[data-zoom="in"]');
    for (let step = 0; step < level.catchStep; step += 1) await plus.click();
    await thingAt(page, other).scrollIntoViewIfNeeded();
    await thingAt(page, other).click();
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(thingAt(page, other)).toHaveAttribute('data-found', 'false');
    await thingAt(page, other).click();
    // After two, rings show where the right ones are.
    await expect(page.locator(`[data-help="${target.id}"]`)).toBeVisible();
  });

  test('a trackpad pinch, sent as small wheel steps with Control, zooms the picture', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const viewport = await page.locator('.zoom-viewport').boundingBox();
    if (viewport === null) throw new Error('The picture is missing');
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.keyboard.down('Control');
    for (let event = 0; event < 6; event += 1) await page.mouse.wheel(0, -8);
    await page.keyboard.up('Control');
    await expect(stage(page)).toHaveAttribute('data-zoom-step', '1');
    // A plain wheel scrolls the zoomed picture and does not zoom.
    await page.mouse.wheel(0, 200);
    await expect(stage(page)).toHaveAttribute('data-zoom-step', '1');
    await expect.poll(() => page.locator('.zoom-viewport').evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });

  test('fits the picture and the zoom buttons at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      for (const selector of ['[data-zoom="in"]', '[data-zoom="out"]', '.zoom-viewport']) {
        const box = await page.locator(selector).boundingBox();
        if (box === null) throw new Error(`${selector} is missing`);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
