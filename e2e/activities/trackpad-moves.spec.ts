import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { emojiNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/trackpad-moves/activity.ts';
import {
  generateLevel,
  type Direction,
  type ScreenCell,
} from '../../src/features/computer-skills/activities/trackpad-moves/level.ts';
import { strings } from '../../src/features/computer-skills/activities/trackpad-moves/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function rangeOf(band: (typeof activity.bands)[number]) {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined) throw new Error(`trackpad-moves serves ${band}`);
  return range;
}

const stage = (page: Page) => page.locator('.trackpad-stage');
const windowOf = (page: Page) => page.locator('.trackpad-window');

/** Scrolls with the wheel over the window, from one screen to another, a notch at a time. */
async function wheelBetween(page: Page, from: ScreenCell, to: ScreenCell): Promise<void> {
  const box = await windowOf(page).boundingBox();
  if (box === null) throw new Error('The window is missing');
  const size = await windowOf(page).evaluate((element) => [element.clientWidth, element.clientHeight]);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const dx = (to.column - from.column) * (size[0] ?? 0);
  const dy = (to.row - from.row) * (size[1] ?? 0);
  const notches = 6;
  for (let notch = 0; notch < notches; notch += 1) await page.mouse.wheel(dx / notches, dy / notches);
}

const SAY_SCROLL: Readonly<Record<Direction, typeof strings.scrollDown>> = {
  down: strings.scrollDown,
  up: strings.scrollUp,
  right: strings.scrollRight,
  left: strings.scrollLeft,
};

const ARROW: Readonly<Record<Direction, string>> = {
  down: 'ArrowDown',
  up: 'ArrowUp',
  right: 'ArrowRight',
  left: 'ArrowLeft',
};

forEachBand(activity.bands, (band) => {
  test('scrolls with the wheel to each hidden thing and taps it', async () => {
    const { max } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    const [first] = level.finds;
    if (first === undefined) throw new Error('A level has finds');
    await expect(stage(page)).toHaveAttribute('data-find', '0');
    // The replay says where to scroll and what to find.
    await expectInstructionSpoken(page, SAY_SCROLL[first.direction]);
    await expect(page.locator(`[data-direction="${first.direction}"]`)).toBeVisible();
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    let at = level.start;
    for (const [index, find] of level.finds.entries()) {
      await expect(stage(page)).toHaveAttribute('data-find', String(index));
      await expect.poll(() => spokenIds(page)).toContain(emojiNames[find.kind].id);
      const thing = page.locator(`[data-thing="${find.id}"]`);
      await expect(thing).toBeDisabled();
      await wheelBetween(page, at, find.screen);
      await expect(stage(page)).toHaveAttribute('data-seen', 'true');
      await expect(thing).toBeEnabled();
      if (index === 0) await saveBandScreenshot(page, band, activity.id, 'found');
      await thing.click();
      await expect(thing).toHaveAttribute('data-tapped', 'true');
      at = find.screen;
    }
    await expect(stage(page)).toHaveAttribute('data-finished', 'true');
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
  });

  test('works with the keyboard alone: arrows scroll the window, Tab and Enter tap', async () => {
    const { min } = rangeOf(band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const [find] = level.finds;
    if (find === undefined) throw new Error('A level has finds');
    await tabTo(page, windowOf(page));
    for (let press = 0; press < 60; press += 1) {
      if ((await stage(page).getAttribute('data-seen')) === 'true') break;
      await page.keyboard.press(ARROW[find.direction]);
    }
    await expect(stage(page)).toHaveAttribute('data-seen', 'true');
    const thing = page.locator(`[data-thing="${find.id}"]`);
    await tabTo(page, thing);
    await page.keyboard.press('Enter');
    await expect(thing).toHaveAttribute('data-tapped', 'true');
  });

  test('fits the window and the gesture picture at both review sizes', async () => {
    const { min } = rangeOf(band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min, size });
      const { page } = launched;
      for (const selector of ['.trackpad-window', '.trackpad-gesture']) {
        const box = await page.locator(selector).boundingBox();
        if (box === null) throw new Error(`${selector} is missing`);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
