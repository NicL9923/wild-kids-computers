import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/big-letters/activity.ts';
import {
  generateLevel,
  shiftFor,
  UNSHIFTED,
  type TypedChar,
} from '../../src/features/computer-skills/activities/big-letters/level.ts';
import { strings } from '../../src/features/computer-skills/activities/big-letters/strings.ts';
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
  if (range === undefined) throw new Error(`big-letters serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.big-stage');

/** Types one character with real key presses: Shift held down for the ones that need it. */
async function typeChar(page: Page, char: TypedChar): Promise<void> {
  if (!char.shift) {
    await page.keyboard.press(char.char);
    return;
  }
  await page.keyboard.down('Shift');
  await page.keyboard.press(char.char);
  await page.keyboard.up('Shift');
}

forEachBand(activity.bands, (band) => {
  test('holds Shift to type each capital, sign, or word of the round', async () => {
    const { min, max } = rangeOf(band);
    // The youngest band starts on capitals; the oldest ends on words with signs.
    const difficulty = band === 'band-6-8' ? min : max;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    const [first] = level.items;
    if (first === undefined) throw new Error('A level has items');

    await expect(stage(page)).toHaveAttribute('data-item', first.text);
    await expectInstructionSpoken(page, first.kind === 'word' ? strings.type : strings.holdShiftType);
    if (level.help === 'keys') {
      const want = first.chars[0];
      if (want === undefined) throw new Error('An item has characters');
      // Shift on the other hand and the key are both lit, and drawn as key caps.
      await expect(page.locator(`[data-key="${shiftFor(want.code)}"]`)).toHaveAttribute('data-mark', 'target');
      await expect(page.locator(`[data-key="${want.code}"]`)).toHaveAttribute('data-mark', 'target');
      await expect(page.locator('.big-cap[data-cap="shift"]')).toBeVisible();
    }
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const item of level.items) {
      await expect(stage(page)).toHaveAttribute('data-item', item.text);
      for (const [index, char] of item.chars.entries()) {
        await typeChar(page, char);
        await expect(stage(page)).toHaveAttribute('data-typed', String(index + 1));
      }
      await expect(stage(page)).toHaveAttribute('data-done', 'true');
    }
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    const next = generateLevel(roundSeed(SEED, 1), difficulty, band);
    await expect(stage(page)).toHaveAttribute('data-item', next.items[0]?.text ?? '');
  });

  test('the key without Shift gets a nudge that says to hold Shift down', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const first = generateLevel(roundSeed(SEED, 0), min, band).items[0];
    const want = first?.chars[0];
    if (first === undefined || want === undefined) throw new Error('A level has an item');
    expect(want.shift).toBe(true);
    await expect(stage(page)).toHaveAttribute('data-item', first.text);

    // The same key without Shift: the small letter, or the plain character under a sign.
    await page.keyboard.press(UNSHIFTED[want.code] ?? want.char.toLowerCase());
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(stage(page)).toHaveAttribute('data-typed', '0');
    await expect.poll(async () => spokenIds(page)).toContain(strings.holdShift.id);
    await typeChar(page, want);
    await expect(stage(page)).toHaveAttribute('data-typed', '1');
  });

  test('shows the card, the key caps, and the keyboard large enough at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const card = await page.locator('.big-card').boundingBox();
      const keyboard = await page.locator('.big-keyboard').boundingBox();
      const key = await page.locator('[data-key="KeyA"]').boundingBox();
      if (card === null || keyboard === null || key === null) throw new Error('Missing a part');
      expect(keyboard.y + keyboard.height).toBeLessThanOrEqual(size.height);
      expect(card.height).toBeGreaterThanOrEqual(160);
      expect(key.width).toBeGreaterThanOrEqual(36);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
