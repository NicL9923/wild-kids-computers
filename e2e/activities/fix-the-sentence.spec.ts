import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/fix-the-sentence/activity.ts';
import {
  differingRange,
  generateLevel,
  type FixLevel,
} from '../../src/features/computer-skills/activities/fix-the-sentence/level.ts';
import { strings } from '../../src/features/computer-skills/activities/fix-the-sentence/strings.ts';
import { SENTENCE_SPEECH } from '../../src/features/computer-skills/activities/fix-the-sentence/tips.ts';
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
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`fix-the-sentence serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.fix-stage');
const field = (page: Page) => page.getByRole('textbox', { name: strings.box.text });

async function pressTimes(page: Page, key: string, times: number): Promise<void> {
  for (let index = 0; index < times; index++) await page.keyboard.press(key);
}

/** Moves the caret from where the level starts it to `offset`, with the arrow keys. */
async function moveCaret(page: Page, level: FixLevel, offset: number): Promise<void> {
  const distance = offset - level.caret;
  await pressTimes(page, distance < 0 ? 'ArrowLeft' : 'ArrowRight', Math.abs(distance));
}

/** Fixes a slip of one extra letter or one extra word: move to its end, select it, and take it out. */
async function removeExtra(page: Page, level: FixLevel): Promise<void> {
  const range = differingRange(level.start, level.target);
  if (range === null) throw new Error('A level has a slip');
  await moveCaret(page, level, range.end);
  // One letter needs only Backspace. A word is selected first, then Backspace takes it all.
  const width = range.end - range.start;
  if (width > 1) await pressTimes(page, 'Shift+ArrowLeft', width);
  await page.keyboard.press('Backspace');
}

forEachBand(activity.bands, (band) => {
  test('moves to the extra letter and takes it out, and the sentence is right', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.kind).toBe('extra-letter');

    await expect(field(page)).toHaveValue(level.start);
    // Replay says to make it say the sentence, and says the sentence.
    await expectInstructionSpoken(page, strings.itSays);
    expect(await spokenIds(page)).toContain(SENTENCE_SPEECH[level.sentence].id);
    // The slip is marked at the low steps.
    await expect(page.locator('.fix-mark')).toBeVisible();
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Focus is still on the replay control. The keys reach the field anyway.
    await removeExtra(page, level);
    await expect(field(page)).toHaveValue(level.target);
    await expect(stage(page)).toHaveAttribute('data-fixed', 'true');
    await expect(page.locator('.fix-mark')).toHaveCount(0);
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    await expect(field(page)).toHaveValue(next.start);
  });

  test('selects an extra word with Shift and the arrows, and Backspace takes it out', async () => {
    // Difficulty 6 is an extra word with the caret at the end, in both bands.
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 6 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 6, band);
    expect(level.kind).toBe('extra-word');
    await expect(field(page)).toHaveValue(level.start);
    await field(page).focus();
    await removeExtra(page, level);
    await expect(field(page)).toHaveValue(level.target);
    await expect(stage(page)).toHaveAttribute('data-fixed', 'true');
  });

  test('a change away from the sentence gets a nudge and undo takes it back; after two the slip is marked', async () => {
    const { max } = rangeOf(band);
    // At the top of the older band the slip starts unmarked.
    const difficulty = band === 'band-9-12' ? max : 7 - 1;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    await expect(field(page)).toHaveValue(level.start);
    await expect(stage(page)).toHaveAttribute('data-marked', String(level.marked));
    await field(page).focus();

    // Typing a letter that does not belong: the text changes, a quiet nudge, and undo fixes it.
    await page.keyboard.press('q');
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await page.keyboard.press(`${primary}+z`);
    await expect(field(page)).toHaveValue(level.start);
    await page.keyboard.press('q');
    await expect(stage(page)).toHaveAttribute('data-marked', 'true');
    await expect
      .poll(async () => spokenIds(page))
      .toContain(level.marked ? 'fix-the-sentence.tipExtraWord' : strings.showMark.id);
  });

  test('shows the sentence, the field, and the keys large enough at both review sizes', async () => {
    const { max } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const box = await field(page).boundingBox();
      const cap = await page.locator('.fix-cap').first().boundingBox();
      if (box === null || cap === null) throw new Error('Missing a part');
      // The whole sentence fits in the field, so the mark lines up with its letters.
      expect(await field(page).evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true);
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(cap.y + cap.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
