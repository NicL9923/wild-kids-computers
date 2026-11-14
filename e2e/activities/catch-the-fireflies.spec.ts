import { expect, test, type Page } from '@playwright/test';
import { BETWEEN_ROUNDS_MS } from '../../src/activityShell/timing.ts';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import activity from '../../src/features/computer-skills/activities/catch-the-fireflies/activity.ts';
import {
  generateLevel,
  LAST_CATCH_PAUSE_MS,
  MISSES_BEFORE_SLOWING,
  SKY,
  SLOW_FACTOR,
} from '../../src/features/computer-skills/activities/catch-the-fireflies/level.ts';
import { strings } from '../../src/features/computer-skills/activities/catch-the-fireflies/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  kitTime,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
} from '../support/activity.ts';
import { readAudioLog } from '../support/audioLog.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 5_150;
const PINNED = Date.UTC(2026, 10, 14, 19);

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const sky = (page: Page) => page.locator('.fireflies-sky');

function range(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('catch-the-fireflies is a rounds activity');
  const found = activity.difficulty[band];
  if (found === undefined) throw new Error(`no range for ${band}`);
  return found;
}

/** How far the first firefly moves in one second of kit time, in sky units. */
async function moveInOneSecond(page: Page): Promise<number> {
  const box = await sky(page).boundingBox();
  if (box === null) throw new Error('The sky is missing');
  // One frame first, so the frame loop has its starting time.
  await kitTime(page).stepFrames(1);
  const before = await centerOf(page, '[data-firefly="firefly-0"]');
  await kitTime(page).stepFrames(60);
  const after = await centerOf(page, '[data-firefly="firefly-0"]');
  return (Math.hypot(after.x - before.x, after.y - before.y) / box.width) * SKY.width;
}

forEachBand(activity.bands, (band) => {
  test('the fireflies fly slowly, and a click on each one catches it', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min, pinClockAt: PINNED });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expect(page.locator('[data-firefly]')).toHaveCount(level.fireflies.length);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // They move, never faster than the level's speed, and at least three fifths of it.
    const moved = await moveInOneSecond(page);
    expect(moved).toBeGreaterThan(level.speed * 0.55);
    expect(moved).toBeLessThan(level.speed * 1.05);

    // Time stands still between steps, so a click lands where the firefly is.
    for (const firefly of level.fireflies) {
      const at = await centerOf(page, `[data-firefly="${firefly.id}"]`);
      await page.mouse.click(at.x, at.y);
      await expect(page.locator(`[data-firefly="${firefly.id}"]`)).toHaveAttribute('data-caught', 'true');
    }
    await expect(sky(page)).toHaveAttribute('data-left', '0');
    const sparkles = (await readAudioLog(page)).filter((entry) => entry.kind === 'sfx' && entry.name === 'sparkle');
    expect(sparkles).toHaveLength(level.fireflies.length);
    await saveBandScreenshot(page, band, `${activity.id}-caught`);

    // A caught firefly stays put while time moves on.
    const resting = await centerOf(page, '[data-firefly="firefly-0"]');
    await kitTime(page).advance(LAST_CATCH_PAUSE_MS);
    expect(await centerOf(page, '[data-firefly="firefly-0"]')).toEqual(resting);
    await kitTime(page).advance(BETWEEN_ROUNDS_MS);
    await expect(sky(page)).toHaveAttribute('data-left', String(next.fireflies.length));
  });

  test('a miss does nothing bad, and a few misses slow the fireflies down', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min, pinClockAt: PINNED });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    // The sky's corner, inside the margin no loop ever reaches.
    const box = await sky(page).boundingBox();
    if (box === null) throw new Error('The sky is missing');
    for (let miss = 0; miss < MISSES_BEFORE_SLOWING; miss += 1) {
      await page.mouse.click(box.x + box.width * 0.01, box.y + box.height * 0.02);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').first()).toBeVisible();
    await expect(sky(page)).toHaveAttribute('data-left', String(level.fireflies.length));
    await expect(sky(page)).toHaveAttribute('data-slow', 'true');
    const sounds = (await readAudioLog(page)).filter((entry) => entry.kind === 'sfx').map((entry) => entry.name);
    expect(sounds).not.toContain('nudge');

    const after = await moveInOneSecond(page);
    // Now no faster than half the level's speed.
    expect(after).toBeLessThan(level.speed * SLOW_FACTOR * 1.05);
    expect(after).toBeGreaterThan(0);
  });

  test('keeps the hardest fireflies large enough at both review sizes', async () => {
    const { max } = range(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({
        activity: activity.id,
        band,
        seed: SEED,
        difficulty: max,
        size,
        pinClockAt: PINNED,
      });
      const { page } = launched;
      const level = generateLevel(roundSeed(SEED, 0), max, band);
      await expect(page.locator('[data-firefly]')).toHaveCount(level.fireflies.length);
      await kitTime(page).stepFrames(30);
      const boxes = await page.locator('[data-firefly]').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, bottom: rect.bottom };
        }),
      );
      for (const each of boxes) {
        expect(each.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
        expect(each.bottom).toBeLessThanOrEqual(size.height);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
