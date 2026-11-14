import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import activity from '../../src/features/computer-skills/activities/follow-the-trail/activity.ts';
import {
  FIELD,
  generateLevel,
  lengthOf,
  pointAt,
  type TrailLevel,
} from '../../src/features/computer-skills/activities/follow-the-trail/level.ts';
import { strings } from '../../src/features/computer-skills/activities/follow-the-trail/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 8_675_309;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const field = (page: Page) => page.locator('.trail-field');

function range(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('follow-the-trail is a rounds activity');
  const found = activity.difficulty[band];
  if (found === undefined) throw new Error(`no range for ${band}`);
  return found;
}

/** A point in field units, in window pixels. */
async function fieldPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await field(page).boundingBox();
  if (box === null) throw new Error('The field is missing');
  return { x: box.x + (x / FIELD.width) * box.width, y: box.y + (y / FIELD.height) * box.height };
}

/** Moves the real mouse along the middle of the path from one distance to another. */
async function walkAlong(page: Page, level: TrailLevel, from: number, to: number): Promise<void> {
  for (let distance = from; distance <= to; distance += 15) {
    const point = pointAt(level, distance);
    const at = await fieldPoint(page, point.x, point.y);
    await page.mouse.move(at.x, at.y, { steps: 2 });
  }
}

forEachBand(activity.bands, (band) => {
  test('walks the bug along the path to its flower, and the next round starts', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    await expectInstructionSpoken(page, strings.instruction);
    await expect(field(page)).toHaveAttribute('data-traveler', level.traveler.bug);
    // The bug waits at the start with a ring until the pointer comes.
    await expect(page.locator('.trail-bug')).toHaveAttribute('data-waiting', 'true');
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await walkAlong(page, level, 0, lengthOf(level) / 2);
    await expect(field(page)).toHaveAttribute('data-with', 'true');
    await expect(page.locator('.trail-bug')).toHaveAttribute('data-waiting', 'false');
    await saveBandScreenshot(page, band, `${activity.id}-walking`);
    await walkAlong(page, level, lengthOf(level) / 2, lengthOf(level));
    await expect(field(page)).toHaveAttribute('data-arrived', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();

    // The next round is a new path from the next round seed, with the bug back at its start.
    await expect(field(page)).toHaveAttribute('data-arrived', 'false');
    await expect(field(page)).toHaveAttribute('data-progress', '0');
    await expect(field(page)).toHaveAttribute('data-traveler', next.traveler.bug);
  });

  test('leaving the path makes the bug wait, and it carries on from there', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const halfway = lengthOf(level) / 2;

    await walkAlong(page, level, 0, halfway);
    const reached = Number(await field(page).getAttribute('data-progress'));
    expect(reached).toBeGreaterThan(halfway - level.width);

    // Off the field entirely: the bug stops and waits where it is.
    const box = await field(page).boundingBox();
    if (box === null) throw new Error('The field is missing');
    await page.mouse.move(box.x + box.width / 2, box.y - 12);
    await expect(page.locator('.trail-bug')).toHaveAttribute('data-waiting', 'true');
    await expect(field(page)).toHaveAttribute('data-progress', String(reached));
    await saveBandScreenshot(page, band, `${activity.id}-waiting`);

    // Jumping straight to the flower does not skip the path.
    const end = pointAt(level, lengthOf(level));
    const flower = await fieldPoint(page, end.x, end.y);
    await page.mouse.move(flower.x, flower.y);
    await expect(field(page)).toHaveAttribute('data-arrived', 'false');
    await expect(field(page)).toHaveAttribute('data-progress', String(reached));

    // Coming back to the bug carries on from where it waited, not from the start.
    await walkAlong(page, level, reached, lengthOf(level));
    await expect(field(page)).toHaveAttribute('data-arrived', 'true');
  });

  test('keeps the hardest path wide enough at both review sizes', async () => {
    const { max } = range(band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const box = await field(page).boundingBox();
      if (box === null) throw new Error('The field is missing');
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      // The path is at least the band's smallest target wide.
      expect((level.width / FIELD.width) * box.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
      await walkAlong(page, level, 0, lengthOf(level) / 3);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
