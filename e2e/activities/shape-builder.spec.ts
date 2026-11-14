import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { shapes } from '../../src/core/strings/shared/index.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/shape-builder/activity.ts';
import {
  fitsPiece,
  generateLevel,
  type ShapeBuilderLevel,
  type Tile,
} from '../../src/features/early-learning/activities/shape-builder/level.ts';
import { strings } from '../../src/features/early-learning/activities/shape-builder/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';
import { carryWithKeys, dragTo } from '../support/sorting.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectRoundShows(page: Page, level: ShapeBuilderLevel): Promise<void> {
  await expect(page.locator('[data-picture]')).toHaveAttribute('data-picture', level.picture.name);
  await expect(page.locator('[data-tile]')).toHaveCount(level.tiles.length);
  await expect(page.locator('[data-outline]')).toHaveCount(level.missing.length);
}

/** The tiles that belong to pieces, each with the piece it fills. */
function pieceTiles(level: ShapeBuilderLevel): (Tile & { piece: number })[] {
  return level.tiles.flatMap((tile) => (tile.piece === null ? [] : [{ ...tile, piece: tile.piece }]));
}

/** A tile and an outline it does not fit, for the wrong try. */
function wrongPair(level: ShapeBuilderLevel): { tile: Tile; outline: number } {
  for (const tile of level.tiles) {
    for (const outline of level.missing) {
      const piece = level.picture.pieces[outline];
      if (piece !== undefined && !fitsPiece(tile, piece)) return { tile, outline };
    }
  }
  throw new Error('This seed gives no tile that misses an outline; pick another seed.');
}

const tile = (id: string) => `[data-tile="${id}"]`;
const outline = (index: number) => `[data-outline="${String(index)}"]`;

forEachBand(activity.bands, (band) => {
  test('finishes the picture by putting each shape on its outline, and a misfit goes back', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = wrongPair(level);
    await page.locator(tile(wrong.tile.id)).hover();
    await expect.poll(() => spokenIds(page)).toContain(shapes[wrong.tile.shape].id);
    await dragTo(page, tile(wrong.tile.id), outline(wrong.outline));
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator(tile(wrong.tile.id))).toBeVisible();
    await expect(page.locator(outline(wrong.outline))).toHaveAttribute('data-filled', 'false');

    for (const each of pieceTiles(level)) {
      await dragTo(page, tile(each.id), outline(each.piece));
      await expect(page.locator(outline(each.piece))).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await saveBandScreenshot(page, band, `${activity.id}-built`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a shape to pick it up and clicks its outline to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const each of pieceTiles(level)) {
      await page.locator(tile(each.id)).click();
      await expect(page.locator(tile(each.id))).toHaveAttribute('data-carried', 'true');
      await page.locator(outline(each.piece)).click();
      await expect(page.locator(outline(each.piece))).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone, with a spare shape left over', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    await expectRoundShows(page, level);
    const free = [...level.missing];
    for (const each of pieceTiles(level)) {
      await tabTo(page, tile(each.id));
      // The arrow keys move over the outlines still empty, in the picture's order.
      await carryWithKeys(page, free.indexOf(each.piece));
      await expect(page.locator(outline(each.piece))).toHaveAttribute('data-filled', 'true');
      free.splice(free.indexOf(each.piece), 1);
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    // The spare stays in the tray: it belongs nowhere.
    await expect(page.locator('[data-tile]')).toHaveCount(level.tiles.filter((each) => each.piece === null).length);
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
        targets: ['[data-tile]', '[data-outline]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
