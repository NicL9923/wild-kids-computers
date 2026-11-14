import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/sentence-builder/activity.ts';
import {
  generateLevel,
  type SentenceBuilderLevel,
  type WordTile,
} from '../../src/features/early-learning/activities/sentence-builder/level.ts';
import { sentenceHandle, strings } from '../../src/features/early-learning/activities/sentence-builder/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: SentenceBuilderLevel): Promise<void> {
  await expect(page.locator('[data-sentence]')).toHaveAttribute('data-sentence', level.sentence);
  await expect(page.locator('[data-tile]')).toHaveText(level.tiles.map((tile) => tile.word));
  await expect(page.locator('[data-place]')).toHaveCount(level.words.length);
}

/** For each place in order, the tile with its word. */
function tilesInOrder(level: SentenceBuilderLevel): WordTile[] {
  return level.words.map((word) => {
    const tile = level.tiles.find((each) => each.word === word);
    if (tile === undefined) throw new Error(`No tile for ${word}`);
    return tile;
  });
}

const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const place = (page: Page, index: number) => page.locator(`[data-place="${String(index)}"]`);

/** A real mouse drag from the tile to the place, in small steps past the click threshold. */
async function drag(page: Page, tileId: string, index: number): Promise<void> {
  const from = await centerOf(page, `[data-tile="${tileId}"]`);
  const to = await centerOf(page, `[data-place="${String(index)}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y - 20, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

forEachBand(activity.bands, (band) => {
  test('builds the spoken sentence by dragging words, and a word in the wrong place goes back', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const order = tilesInOrder(level);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(sentenceHandle(level.sentence).id);
    // The line shows the instruction, not the sentence, which would give the order away.
    await expect(page.locator('.wk-instruction-text')).toHaveText(strings.instruction.text);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [first, second] = order;
    if (first === undefined || second === undefined) throw new Error('Every sentence has two words');
    await drag(page, second.id, 0);
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(place(page, 0)).toHaveAttribute('data-filled', 'false');

    for (const [index, each] of order.entries()) {
      await drag(page, each.id, index);
      await expect(place(page, index)).toHaveText(each.word);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-built`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a word to pick it up and clicks its place to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const [index, each] of tilesInOrder(level).entries()) {
      await tile(page, each.id).click();
      await expect(tile(page, each.id)).toHaveAttribute('data-carried', 'true');
      await place(page, index).click();
      await expect(place(page, index)).toHaveText(each.word);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    const order = tilesInOrder(level);
    // Fill the last place first: Enter picks the word up over the first empty place, and the
    // left arrow wraps around to the last one.
    const last = order.at(-1);
    if (last === undefined) throw new Error('Every sentence has words');
    await tabTo(page, `[data-tile="${last.id}"]`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await expect(place(page, order.length - 1)).toHaveAttribute('data-carry-over', 'true');
    await page.keyboard.press('Enter');
    await expect(place(page, order.length - 1)).toHaveText(last.word);
    for (const [index, each] of order.slice(0, -1).entries()) {
      await tabTo(page, `[data-tile="${each.id}"]`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expect(place(page, index)).toHaveText(each.word);
    }
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-tile]', '[data-place]', '[data-control="hear"]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
