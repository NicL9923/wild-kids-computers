import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { letterNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/find-the-key/activity.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/find-the-key/level.ts';
import { strings } from '../../src/features/computer-skills/activities/find-the-key/strings.ts';
import { letterCode } from '../../src/features/computer-skills/shared/keyboardLayout.ts';
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
/** A pinned kit clock holds the pressed key's light on until the test has looked at it. */
const PINNED = Date.UTC(2026, 10, 14, 10);

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`find-the-key serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.findkey-stage');

forEachBand(activity.bands, (band) => {
  test('presses each letter as it is shown and named, in either case, and the round ends', async () => {
    const { max } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const [first] = level.letters;
    if (first === undefined) throw new Error('A level has letters');

    await expect(stage(page)).toHaveAttribute('data-letter', first);
    // The instruction names the letter: replay says "Press the letter" and the letter.
    await expectInstructionSpoken(page, strings.press);
    // The letter follows the first clip, so it is logged only once that clip ends.
    await expect.poll(() => spokenIds(page)).toContain(letterNames[first].id);
    // The youngest band always sees the key lit on the picture.
    const lit = page.locator(`[data-key="${letterCode(first)}"]`);
    if (level.help === 'key') await expect(lit).toHaveAttribute('data-mark', 'target');
    else await expect(lit).toHaveAttribute('data-mark', 'none');
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const [index, letter] of level.letters.entries()) {
      await expect(stage(page)).toHaveAttribute('data-letter', letter);
      // Capitals on odd letters: Shift with the letter counts the same.
      await page.keyboard.press(index % 2 === 1 ? `Shift+${letter.toUpperCase()}` : letter);
      await expect(stage(page)).toHaveAttribute('data-found', 'true');
    }
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    const next = generateLevel(roundSeed(SEED, 1), max, band);
    await expect(stage(page)).toHaveAttribute('data-letter', next.letters[0] ?? '');
  });

  test('a different letter gets a gentle nudge, and after two the right key lights up', async () => {
    const { max } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, pinClockAt: PINNED });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const [first] = level.letters;
    if (first === undefined) throw new Error('A level has letters');
    const other = first === 'q' ? 'z' : 'q';
    await expect(stage(page)).toHaveAttribute('data-letter', first);

    await page.keyboard.press(other);
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    // The key that was pressed lights on the picture, so the child sees which one it was.
    await expect(page.locator(`[data-key="${letterCode(other)}"]`)).toHaveAttribute('data-mark', 'pressed');
    await page.keyboard.press(other);
    await expect(page.locator(`[data-key="${letterCode(first)}"]`)).toHaveAttribute('data-mark', 'target');
    await expect(stage(page)).toHaveAttribute('data-letter', first);
    await expect(stage(page)).toHaveAttribute('data-found', 'false');
    // Keys that are not letters are not wrong: no ring, nothing counted.
    await page.keyboard.press('Space');
    await page.keyboard.press(first);
    await expect(stage(page)).toHaveAttribute('data-found', 'true');
  });

  test('the letter card says its letter when the pointer rests on it', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const [first] = generateLevel(roundSeed(SEED, 0), min, band).letters;
    if (first === undefined) throw new Error('A level has letters');
    await page.locator('.findkey-card').hover();
    await expect
      .poll(async () => (await spokenIds(page)).filter((id) => id === letterNames[first].id).length)
      .toBeGreaterThan(0);
  });

  test('shows the letter and the keyboard picture large enough at both review sizes', async () => {
    const { min } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min, size });
      const { page } = launched;
      const card = await page.locator('.findkey-card').boundingBox();
      const key = await page.locator('[data-key="KeyA"]').boundingBox();
      if (card === null || key === null) throw new Error('The card or the keyboard is missing');
      expect(card.y + card.height).toBeLessThanOrEqual(size.height);
      // Each key cap is big enough to read its letter.
      expect(key.width).toBeGreaterThanOrEqual(40);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
