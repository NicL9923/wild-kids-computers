import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/space-and-enter/activity.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/space-and-enter/level.ts';
import { strings } from '../../src/features/computer-skills/activities/space-and-enter/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { expectVisibleFocus, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`space-and-enter serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.jump-stage');

/** Waits until the critter stands at stop `index`, waiting for a key. */
async function waitingAt(page: Page, index: number): Promise<void> {
  await expect(stage(page)).toHaveAttribute('data-stop', String(index));
  await expect(stage(page)).toHaveAttribute('data-phase', 'waiting', { timeout: 10_000 });
}

forEachBand(activity.bands, (band) => {
  test('jumps every log with Space and opens every door with Enter, all the way home', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.walk).toBe('waits');

    await waitingAt(page, 0);
    // It waits as long as the child needs: still there a while later.
    await page.waitForTimeout(800);
    await expect(stage(page)).toHaveAttribute('data-phase', 'waiting');
    await expect(page.locator('[data-key="Space"]')).toHaveAttribute('data-mark', 'target');
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const [index, stop] of level.stops.entries()) {
      await waitingAt(page, index);
      await page.keyboard.press(stop.kind === 'jump' ? 'Space' : 'Enter');
    }
    await expect(stage(page)).toHaveAttribute('data-phase', 'home');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    await expect(stage(page)).toHaveAttribute('data-stop', '0');
  });

  test('the other key at a stop says which key to use, and the critter waits', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    await waitingAt(page, 0);
    await page.keyboard.press('Enter');
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.spaceIsLong.id);
    await expect(stage(page)).toHaveAttribute('data-phase', 'waiting');
    await expect(stage(page)).toHaveAttribute('data-stop', '0');
    await expectInstructionSpoken(page, strings.pressSpace);
    // The replay control has focus now, so Space would press it. Tab comes back to the path,
    // which gives Space back to the activity with no pointer at all.
    await tabTo(page, page.locator('[data-key-area]'));
    await expectVisibleFocus(page);
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('data-stop', '1');
  });

  test('fits the path and the keyboard at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const critter = await page.locator('.jump-critter').boundingBox();
      const space = await page.locator('[data-key="Space"]').boundingBox();
      if (critter === null || space === null) throw new Error('The path or the keyboard is missing');
      expect(critter.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
      expect(space.y + space.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});

test.describe('band-6-8 keeps walking', () => {
  test('a press as the critter comes near takes it over without stopping', async () => {
    launched = await openActivity({ activity: activity.id, band: 'band-6-8', seed: SEED, difficulty: 5 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 5, 'band-6-8');
    expect(level.walk).toBe('keeps-walking');
    // The first stop is close to the start, so the window is open from the first step.
    await expect(stage(page)).toHaveAttribute('data-phase', 'walking');
    await page.keyboard.press('Space');
    await expect(stage(page)).toHaveAttribute('data-phase', 'jumping');
    await expect(stage(page)).toHaveAttribute('data-stop', '1');
  });
});
