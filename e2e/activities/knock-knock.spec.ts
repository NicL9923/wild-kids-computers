import { expect, test, type Page } from '@playwright/test';
import { BETWEEN_ROUNDS_MS } from '../../src/activityShell/timing.ts';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { emojiNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/knock-knock/activity.ts';
import {
  generateLevel,
  KNOCKS_PER_HINT,
  MAX_KNOCK_DIFFICULTY,
  OPENED_PAUSE_MS,
} from '../../src/features/computer-skills/activities/knock-knock/level.ts';
import { strings } from '../../src/features/computer-skills/activities/knock-knock/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  kitTime,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 1_492;
const PINNED = Date.UTC(2026, 10, 14, 10);

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const street = (page: Page) => page.locator('.knock-street');
const door = (page: Page, id: string) => page.locator(`[data-door="${id}"]`);
const dots = (page: Page, id: string) => page.locator(`.knock-house:has([data-door="${id}"]) .knock-dots`);

forEachBand(activity.bands, (band) => {
  test('one click only knocks, and a real double-click opens each door', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1, pinClockAt: PINNED });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 1, band);
    const next = generateLevel(roundSeed(SEED, 1), 1, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expect(page.locator('[data-door]')).toHaveCount(level.doors.length);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // One click: the first dot fills and the door stays shut. Then the knock fades.
    const [first] = level.doors;
    if (first === undefined) throw new Error('A street has doors');
    const at = await centerOf(page, `[data-door="${first.id}"]`);
    await page.mouse.click(at.x, at.y);
    await expect(dots(page, first.id)).toHaveAttribute('data-filled', '1');
    await expect(door(page, first.id)).toHaveAttribute('data-open', 'false');
    await saveBandScreenshot(page, band, `${activity.id}-knocked`);
    await kitTime(page).advance(level.windowMs + 1);
    await expect(dots(page, first.id)).toHaveAttribute('data-filled', '0');

    for (const each of level.doors) {
      const center = await centerOf(page, `[data-door="${each.id}"]`);
      await page.mouse.dblclick(center.x, center.y);
      await expect(door(page, each.id)).toHaveAttribute('data-open', 'true');
      await expect(dots(page, each.id)).toHaveAttribute('data-filled', '2');
      // The animal inside says who it is.
      await expect.poll(() => spokenIds(page)).toContain(emojiNames[each.guest].id);
    }
    await expect(street(page)).toHaveAttribute('data-open', String(level.doors.length));
    // The doors swing open on real time, not kit time; let them finish before the picture.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    await saveBandScreenshot(page, band, `${activity.id}-open`);

    await kitTime(page).advance(OPENED_PAUSE_MS);
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    await kitTime(page).advance(BETWEEN_ROUNDS_MS);
    await expect(street(page)).toHaveAttribute('data-open', '0');
    await expect(page.locator('[data-door]')).toHaveCount(next.doors.length);
  });

  test('two clicks within the window open a door, two slow clicks only knock, and the voice explains', async () => {
    const hardest = MAX_KNOCK_DIFFICULTY;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: hardest, pinClockAt: PINNED });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), hardest, band);
    const [first, second] = level.doors;
    if (first === undefined || second === undefined) throw new Error('A street has two doors');
    const at = await centerOf(page, `[data-door="${first.id}"]`);

    // Slow single clicks, each one after the window has passed.
    for (let knock = 0; knock < KNOCKS_PER_HINT; knock += 1) {
      await page.mouse.click(at.x, at.y);
      await kitTime(page).advance(level.windowMs + 1);
    }
    await expect(door(page, first.id)).toHaveAttribute('data-open', 'false');
    await expect.poll(() => spokenIds(page)).toContain(strings.twoQuick.id);

    // Two clicks exactly the window apart still count as a double-click.
    await page.mouse.click(at.x, at.y);
    await kitTime(page).advance(level.windowMs);
    await page.mouse.click(at.x, at.y);
    await expect(door(page, first.id)).toHaveAttribute('data-open', 'true');

    // A click on one door and then on another opens neither.
    const other = await centerOf(page, `[data-door="${second.id}"]`);
    const third = level.doors[2];
    if (third === undefined) throw new Error('The hardest street has more doors');
    const far = await centerOf(page, `[data-door="${third.id}"]`);
    await page.mouse.click(other.x, other.y);
    await page.mouse.click(far.x, far.y);
    await expect(door(page, second.id)).toHaveAttribute('data-open', 'false');
    await expect(door(page, third.id)).toHaveAttribute('data-open', 'false');
  });

  test('keeps the hardest street clear at both review sizes', async () => {
    const level = generateLevel(roundSeed(SEED, 0), MAX_KNOCK_DIFFICULTY, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({
        activity: activity.id,
        band,
        seed: SEED,
        difficulty: MAX_KNOCK_DIFFICULTY,
        size,
      });
      const { page } = launched;
      await expect(page.locator('[data-door]')).toHaveCount(level.doors.length);
      const boxes = await page.locator('[data-door], .knock-dots').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, bottom: rect.bottom, door: element.hasAttribute('data-door') };
        }),
      );
      const area = await street(page).boundingBox();
      if (area === null) throw new Error('The street is missing');
      expect(Math.min(...boxes.filter((box) => box.door).map((box) => box.width))).toBeGreaterThanOrEqual(56);
      // Doors and their knock dots stay inside the street.
      for (const box of boxes) expect(box.bottom).toBeLessThanOrEqual(area.y + area.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
