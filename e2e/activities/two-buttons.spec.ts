import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import activity from '../../src/features/computer-skills/activities/two-buttons/activity.ts';
import { generateLevel, TRIES_BEFORE_HINT } from '../../src/features/computer-skills/activities/two-buttons/level.ts';
import { strings } from '../../src/features/computer-skills/activities/two-buttons/strings.ts';
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
import { expectFocused, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 7_331;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const board = (page: Page) => page.locator('.buttons-board');

function range(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('two-buttons is a rounds activity');
  const found = activity.difficulty[band];
  if (found === undefined) throw new Error(`no range for ${band}`);
  return found;
}

forEachBand(activity.bands, (band) => {
  test('sorts each thing with the button its mouse shows, left click and right click', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);

    // Replay says the instruction and how to right-click on a trackpad.
    await expect(page.locator('.wk-instruction-text')).toContainText(strings.trackpad.text);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(strings.trackpad.id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const [index, thing] of level.things.entries()) {
      await expect(page.locator('[data-thing]')).toHaveAttribute('data-thing', thing.id);
      const at = await centerOf(page, '[data-thing]');
      await page.mouse.click(at.x, at.y, { button: thing.button });
      await expect(board(page)).toHaveAttribute('data-sorted', String(index + 1));
      if (index === 1) await saveBandScreenshot(page, band, `${activity.id}-sorting`);
    }
    // Each box holds the things for its button.
    for (const side of ['left', 'right'] as const) {
      await expect(page.locator(`[data-box="${side}"] img`)).toHaveCount(
        level.things.filter((thing) => thing.button === side).length,
      );
    }
    await expect(board(page)).toHaveAttribute('data-sorted', '0');
    await expect(page.locator('[data-thing]')).toHaveAttribute('data-thing', next.things[0]?.id ?? '');
  });

  test('the other button gets a calm word naming the right one, and the thing waits', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const first = level.things[0];
    if (first === undefined) throw new Error('A round has things');
    const wrong = first.button === 'left' ? 'right' : 'left';
    const at = await centerOf(page, '[data-thing]');
    for (let tryNumber = 0; tryNumber < TRIES_BEFORE_HINT; tryNumber += 1) {
      await page.mouse.click(at.x, at.y, { button: wrong });
    }
    await expect(board(page)).toHaveAttribute('data-sorted', '0');
    await expect
      .poll(() => spokenIds(page))
      .toContain((first.button === 'left' ? strings.useLeft : strings.useRight).id);
    // After two tries the big mouse over the right box lights up.
    await expect(page.locator(`.buttons-side[data-side="${first.button}"]`)).toHaveAttribute('data-hint', 'true');
    await saveBandScreenshot(page, band, `${activity.id}-hint`);
    await page.mouse.click(at.x, at.y, { button: first.button });
    await expect(board(page)).toHaveAttribute('data-sorted', '1');
    await expect(page.locator(`.buttons-side[data-side="${first.button}"]`)).toHaveAttribute('data-hint', 'false');
  });

  test('works from the keyboard: Enter is a left click and the menu key is a right click', async () => {
    const { min } = range(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    for (const [index, thing] of level.things.entries()) {
      const card = page.locator('[data-thing]');
      await expect(card).toHaveAttribute('data-thing', thing.id);
      // A new card each time: Tab finds it.
      if (index === 0) await tabTo(page, card);
      else await card.focus();
      await expectFocused(card);
      await page.keyboard.press(thing.button === 'left' ? 'Enter' : 'Shift+F10');
      await expect(board(page)).toHaveAttribute('data-sorted', String(index + 1));
    }
  });

  test('keeps the board readable at both review sizes', async () => {
    const { max } = range(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const card = await page.locator('[data-thing]').boundingBox();
      const area = await board(page).boundingBox();
      if (card === null || area === null) throw new Error('The board is missing');
      expect(card.width).toBeGreaterThanOrEqual(band === 'band-6-8' ? 112 : 88);
      expect(area.y + area.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
