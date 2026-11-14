import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/build-the-word/activity.ts';
import {
  generateLevel,
  type BuildTheWordLevel,
  type Tile,
} from '../../src/features/early-learning/activities/build-the-word/level.ts';
import { strings } from '../../src/features/early-learning/activities/build-the-word/strings.ts';
import { letterSound } from '../../src/features/early-learning/reading/alphabet.ts';
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

async function expectRoundShows(page: Page, level: BuildTheWordLevel): Promise<void> {
  await expect(page.locator('[data-word]')).toHaveAttribute('data-word', level.word);
  await expect(page.locator('[data-tile]')).toHaveText(level.tiles.map((tile) => tile.letter));
  await expect(page.locator('[data-box]')).toHaveCount(level.letters.length);
}

/** For each box in order, a tile with its letter, never the same tile twice. */
function tilesInOrder(level: BuildTheWordLevel): Tile[] {
  const used = new Set<string>();
  return level.letters.map((letter) => {
    const tile = level.tiles.find((each) => each.letter === letter && !used.has(each.id));
    if (tile === undefined) throw new Error(`No tile for ${letter}`);
    used.add(tile.id);
    return tile;
  });
}

const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const box = (page: Page, index: number) => page.locator(`[data-box="${String(index)}"]`);

/** A real mouse drag from the tile to the box, in small steps past the click threshold. */
async function drag(page: Page, tileId: string, index: number): Promise<void> {
  const from = await centerOf(page, `[data-tile="${tileId}"]`);
  const to = await centerOf(page, `[data-box="${String(index)}"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y - 20, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

forEachBand(activity.bands, (band) => {
  test('builds the pictured word by dragging tiles, and a tile in the wrong box goes home', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const order = tilesInOrder(level);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[level.word].id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The second letter dropped in the first box does not stay there.
    const [first, second] = order;
    if (first === undefined || second === undefined) throw new Error('Every word has two letters');
    await drag(page, second.id, 0);
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(box(page, 0)).toHaveAttribute('data-filled', 'false');
    await expect(tile(page, second.id)).toBeVisible();

    for (const [index, each] of order.entries()) {
      await drag(page, each.id, index);
      await expect(box(page, index)).toHaveText(each.letter);
    }
    await expect.poll(() => spokenIds(page)).toContain(letterSound(first.letter).id);
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-built`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a tile to pick it up and clicks its box to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const [index, each] of tilesInOrder(level).entries()) {
      await tile(page, each.id).click();
      await expect(tile(page, each.id)).toHaveAttribute('data-carried', 'true');
      await box(page, index).click();
      await expect(box(page, index)).toHaveText(each.letter);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    for (const [index, each] of tilesInOrder(level).entries()) {
      await tabTo(page, `[data-tile="${each.id}"]`);
      await expect.poll(() => spokenIds(page)).toContain(letterSound(each.letter).id);
      // Enter picks the tile up over the first empty box, which is its box when filling left to
      // right, and Enter puts it down.
      await page.keyboard.press('Enter');
      await expect(box(page, index)).toHaveAttribute('data-carry-over', 'true');
      await page.keyboard.press('Enter');
      await expect(box(page, index)).toHaveText(each.letter);
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
        targets: ['[data-tile]', '[data-box]', '[data-control="hear"]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
