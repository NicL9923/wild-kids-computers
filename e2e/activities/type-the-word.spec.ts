import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { emojiNames, letterNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/type-the-word/activity.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/type-the-word/level.ts';
import { strings } from '../../src/features/computer-skills/activities/type-the-word/strings.ts';
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

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`type-the-word serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.ttw-stage');

forEachBand(activity.bands, (band) => {
  test('types each word of the round letter by letter, and the letters fill in', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const [first] = level.words;
    if (first === undefined) throw new Error('A level has words');

    await expect(stage(page)).toHaveAttribute('data-word', first.id);
    // Replay says "Type the word" and the word itself.
    await expectInstructionSpoken(page, strings.type);
    await expect.poll(async () => spokenIds(page)).toContain(emojiNames[first.id].id);
    // The youngest steps light the next key on the keyboard picture.
    await expect(page.locator(`[data-key="${letterCode(first.letters[0] ?? 'a')}"]`)).toHaveAttribute(
      'data-mark',
      'target',
    );
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const word of level.words) {
      await expect(stage(page)).toHaveAttribute('data-word', word.id);
      for (const [index, letter] of word.letters.entries()) {
        await page.keyboard.press(letter);
        await expect(stage(page)).toHaveAttribute('data-typed', String(index + 1));
        await expect(page.locator('.ttw-slot').nth(index)).toHaveAttribute('data-state', 'typed');
      }
      await expect(stage(page)).toHaveAttribute('data-done', 'true');
    }
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    await expect(stage(page)).toHaveAttribute('data-word', next.words[0]?.id ?? '');
  });

  test('another letter changes nothing in the word, and after two the right key lights and is named', async () => {
    const { max } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const want = level.words[0]?.letters[0];
    if (want === undefined) throw new Error('A level has a word');
    const other = want === 'q' ? 'z' : 'q';
    expect(level.help).toBe('none');
    await expect(page.locator(`[data-key="${letterCode(want)}"]`)).toHaveAttribute('data-mark', 'none');

    await page.keyboard.press(other);
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(stage(page)).toHaveAttribute('data-typed', '0');
    await page.keyboard.press(other);
    await expect(page.locator(`[data-key="${letterCode(want)}"]`)).toHaveAttribute('data-mark', 'target');
    await expect.poll(async () => spokenIds(page)).toContain(letterNames[want].id);
    // Capitals count the same as small letters.
    await page.keyboard.press(`Shift+${want.toUpperCase()}`);
    await expect(stage(page)).toHaveAttribute('data-typed', '1');
  });

  test('shows the picture, the word, and the keyboard large enough at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const slot = await page.locator('.ttw-slot').first().boundingBox();
      const picture = await page.locator('.ttw-picture').boundingBox();
      const keyboard = await page.locator('.ttw-keyboard').boundingBox();
      const key = await page.locator('[data-key="KeyA"]').boundingBox();
      if (slot === null || picture === null || keyboard === null || key === null) throw new Error('Missing a part');
      expect(keyboard.y + keyboard.height).toBeLessThanOrEqual(size.height);
      expect(picture.width).toBeGreaterThanOrEqual(160);
      expect(slot.width).toBeGreaterThanOrEqual(56);
      expect(key.width).toBeGreaterThanOrEqual(40);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
