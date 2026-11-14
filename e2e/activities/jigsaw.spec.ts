import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/jigsaw/activity.ts';
import { generateLevel, type JigsawLevel } from '../../src/features/early-learning/activities/jigsaw/level.ts';
import { strings } from '../../src/features/early-learning/activities/jigsaw/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { FIXTURE_PROFILE, type LaunchedApp } from '../support/launchApp.ts';
import { settle } from '../support/logic.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const piece = (page: Page, index: number) => page.locator(`[data-piece="${String(index)}"]`);
const place = (page: Page, index: number) => page.locator(`[data-place="${String(index)}"]`);

async function expectRoundShows(page: Page, level: JigsawLevel): Promise<void> {
  await expect(page.locator('[data-piece]')).toHaveCount(level.tray.length);
  for (const [slot, index] of level.tray.entries()) {
    await expect(page.locator('[data-piece]').nth(slot)).toHaveAttribute('data-piece', String(index));
  }
  await expect(page.locator('[data-place][data-filled="true"]')).toHaveCount(0);
}

/** Presses on a piece, drags it with real pointer moves, and lets go over a place. */
async function drag(page: Page, from: number, to: number): Promise<void> {
  const start = await centerOf(page, `[data-piece="${String(from)}"]`);
  const end = await centerOf(page, `[data-place="${String(to)}"]`);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

forEachBand(activity.bands, (band) => {
  test('a piece dropped in the wrong place goes back, and dragging every piece home finishes the picture', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    // A profile with no paintings always gets the bundled picture.
    await expect(page.locator('.jg-stage')).toHaveAttribute('data-source', 'scene');
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const [first = 0] = level.tray;
    const wrong = first === 0 ? 1 : 0;
    await drag(page, first, wrong);
    await expect(place(page, wrong)).toHaveAttribute('data-filled', 'false');
    await expect(piece(page, first)).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.goesSomewhereElse.id);

    for (const index of level.tray) {
      await drag(page, index, index);
      await expect(place(page, index)).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.jg-stage')).toHaveAttribute('data-done', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.allDone.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-done`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('click to place: clicks a piece to pick it up and clicks its place to put it down', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await expectRoundShows(page, level);
    for (const index of level.tray) {
      await piece(page, index).click();
      await expect(piece(page, index)).toHaveAttribute('data-carried', 'true');
      await place(page, index).click();
      await expect(place(page, index)).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.jg-stage')).toHaveAttribute('data-done', 'true');
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    const filled = new Set<number>();
    for (const index of level.tray) {
      await tabTo(page, `[data-piece="${String(index)}"]`);
      // Enter picks the piece up over the first empty place; each arrow moves to the next empty one.
      await page.keyboard.press('Enter');
      const empty = Array.from({ length: level.columns * level.rows }, (_, at) => at).filter((at) => !filled.has(at));
      for (let step = 0; step < empty.indexOf(index); step += 1) await page.keyboard.press('ArrowRight');
      await expect(place(page, index)).toHaveAttribute('data-carry-over', 'true');
      await page.keyboard.press('Enter');
      await expect(place(page, index)).toHaveAttribute('data-filled', 'true');
      filled.add(index);
    }
    await expect(page.locator('.jg-stage')).toHaveAttribute('data-done', 'true');
  });

  test('fits the most pieces of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-piece]', '[data-place]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});

/** Saves a painting to the profile's gallery: busy stripes of color, or plain white paper. */
async function savePainting(page: Page, kind: 'busy' | 'blank'): Promise<void> {
  await page.evaluate(
    async ({ profileId, busy }) => {
      const png = async (width: number, height: number) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('No canvas');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        if (busy) {
          const stripe = width / 40;
          for (let x = 0; x < 40; x += 1) {
            context.fillStyle = `hsl(${String(x * 37)} 80% ${x % 2 === 0 ? '30%' : '70%'})`;
            context.fillRect(x * stripe, 0, stripe, height);
          }
        }
        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      };
      const bridge = window.wkcTest?.bridge;
      if (bridge === undefined) throw new Error('The page has no test hook.');
      await bridge.pictures.save(profileId, { png: await png(1600, 1000), thumbnail: await png(320, 200) });
    },
    { profileId: FIXTURE_PROFILE.id, busy: kind === 'busy' },
  );
}

/** Leaves the activity and comes back, so the first round starts again and reads the gallery. */
async function reopen(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/area/early-learning';
  });
  await expect(page.locator('[data-activity="jigsaw"] .wk-activity-stage')).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = '#/activity/jigsaw';
  });
}

test.describe('pictures from the gallery', () => {
  // A session seed whose first round asks for a painting.
  const seed = Array.from({ length: 50 }, (_, index) => SEED + index).find(
    (each) => generateLevel(roundSeed(each, 0), 1, 'band-3-5').gallery !== null,
  );

  for (const [kind, from] of [
    ['busy', 'gallery'],
    ['blank', 'scene'],
  ] as const) {
    test(`a ${kind} painting makes the picture come from the ${from}`, async () => {
      if (seed === undefined) throw new Error('No seed asks for a painting');
      launched = await openActivity({ activity: activity.id, band: 'band-3-5', seed, difficulty: 1 });
      const { page } = launched;
      await savePainting(page, kind);
      await reopen(page);
      await expect(page.locator('.jg-stage')).toHaveAttribute('data-source', from);
      await expectRoundShows(page, generateLevel(roundSeed(seed, 0), 1, 'band-3-5'));
      if (from === 'gallery') {
        await saveBandScreenshot(page, 'band-3-5', `${activity.id}-painting`);
        await piece(page, 0).click();
        await place(page, 0).click();
        await expect(place(page, 0)).toHaveAttribute('data-filled', 'true');
      }
    });
  }
});
