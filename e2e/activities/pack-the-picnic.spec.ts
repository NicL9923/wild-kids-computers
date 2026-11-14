import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/computer-skills/activities/pack-the-picnic/activity.ts';
import {
  belongs,
  generateLevel,
  TRIES_BEFORE_HINT,
  type PicnicLevel,
} from '../../src/features/computer-skills/activities/pack-the-picnic/level.ts';
import { strings } from '../../src/features/computer-skills/activities/pack-the-picnic/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { expectVisibleFocus, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 2_024;
/** The first difficulty with a place for each piece on the blanket. Both bands reach it. */
const BLANKET_DIFFICULTY = 4;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const scene = (page: Page) => page.locator('.picnic-scene');

function range(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('pack-the-picnic is a rounds activity');
  const found = activity.difficulty[band];
  if (found === undefined) throw new Error(`no range for ${band}`);
  return found;
}

function homeOf(level: PicnicLevel, pieceId: string): string {
  const place = level.places.find((each) => belongs(each, pieceId));
  if (place === undefined) throw new Error(`${pieceId} has no place`);
  return place.id;
}

/** Presses on a piece, moves in small steps to a place, and lets go: a real drag. */
async function drag(page: Page, pieceId: string, placeId: string): Promise<void> {
  const from = await centerOf(page, `[data-piece="${pieceId}"]`);
  const to = await centerOf(page, `[data-place="${placeId}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

forEachBand(activity.bands, (band) => {
  test('click to place: picks up each food with a click and puts it in the basket with another', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    expect(level.mode).toBe('basket');

    await expectInstructionSpoken(page, strings.instruction);
    await expect(page.locator('[data-piece]')).toHaveCount(level.pieces.length);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const [index, piece] of level.pieces.entries()) {
      const at = await centerOf(page, `[data-piece="${piece.id}"]`);
      await page.mouse.click(at.x, at.y);
      await expect(page.locator(`[data-piece="${piece.id}"]`)).toHaveAttribute('data-carried', 'true');
      // The basket shows it will take the food.
      await expect(page.locator('[data-place="basket"]')).toHaveAttribute('data-carry-valid', 'true');
      const basket = await centerOf(page, '[data-place="basket"]');
      await page.mouse.click(basket.x, basket.y);
      await expect(page.locator(`[data-piece="${piece.id}"]`)).toHaveCount(0);
      await expect(scene(page)).toHaveAttribute('data-packed', String(index + 1));
    }
    // The food peeks out of the basket.
    await expect(page.locator('.picnic-load')).toHaveCount(level.pieces.length);
    await saveBandScreenshot(page, band, `${activity.id}-packed`);

    await expect(scene(page)).toHaveAttribute('data-packed', '0');
    await expect(page.locator('[data-piece]')).toHaveCount(next.pieces.length);
  });

  test('drags each food to its shadow, and a wrong place sends it back with a calm word', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: BLANKET_DIFFICULTY });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), BLANKET_DIFFICULTY, band);
    expect(level.mode).toBe('spots');
    // The blanket has its own instruction, and the replay control says it.
    await expect(page.locator('.wk-instruction-text')).toContainText(strings.spots.text);
    await expectInstructionSpoken(page, strings.spots);
    await saveBandScreenshot(page, band, `${activity.id}-blanket`);

    const [first] = level.pieces;
    if (first === undefined) throw new Error('A picnic has food');
    const home = homeOf(level, first.id);
    const wrong = level.places.find((place) => place.id !== home);
    if (wrong === undefined) throw new Error('A blanket has more than one place');
    for (let tryNumber = 1; tryNumber <= TRIES_BEFORE_HINT; tryNumber += 1) {
      await drag(page, first.id, wrong.id);
      // It goes back to the grass, nothing is lost.
      await expect(page.locator(`[data-piece="${first.id}"]`)).toHaveAttribute('data-carried', 'false');
      await expect(scene(page)).toHaveAttribute('data-packed', '0');
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.goesSomewhereElse.id);
    // After two tries its own place lights up.
    await expect(page.locator(`[data-place="${home}"]`)).toHaveAttribute('data-hint', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.hereItIs.id);

    for (const [index, piece] of level.pieces.entries()) {
      await drag(page, piece.id, homeOf(level, piece.id));
      await expect(scene(page)).toHaveAttribute('data-packed', String(index + 1));
    }
    await expect(page.locator(`[data-place="${home}"]`)).toHaveAttribute('data-hint', 'false');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').first()).toBeVisible();
  });

  test('packs with the keyboard alone: Enter picks up, arrows choose the place, Enter puts down', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: BLANKET_DIFFICULTY });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), BLANKET_DIFFICULTY, band);
    for (const [index, piece] of level.pieces.entries()) {
      const button = page.locator(`[data-piece="${piece.id}"]`);
      await tabTo(page, button);
      await expectVisibleFocus(page);
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('data-carried', 'true');
      const home = page.locator(`[data-place="${homeOf(level, piece.id)}"]`);
      for (let presses = 0; presses < level.places.length; presses += 1) {
        if ((await home.getAttribute('data-carry-over')) === 'true') break;
        await page.keyboard.press('ArrowRight');
      }
      await expect(home).toHaveAttribute('data-carry-over', 'true');
      await page.keyboard.press('Enter');
      await expect(scene(page)).toHaveAttribute('data-packed', String(index + 1));
    }
  });

  test('keeps the hardest picnic large and on screen at both review sizes', async () => {
    const { max } = range(band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await expect(page.locator('[data-piece]')).toHaveCount(level.pieces.length);
      const boxes = await page.locator('[data-piece], [data-place]').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, bottom: rect.bottom, right: rect.right };
        }),
      );
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(band === 'band-3-5' ? 72 : 56);
        expect(box.bottom).toBeLessThanOrEqual(size.height);
        expect(box.right).toBeLessThanOrEqual(size.width);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
