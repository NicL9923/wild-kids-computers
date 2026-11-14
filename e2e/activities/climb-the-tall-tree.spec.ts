import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import { emojiNames } from '../../src/core/strings/shared/index.ts';
import activity from '../../src/features/computer-skills/activities/climb-the-tall-tree/activity.ts';
import {
  aboveFirstScreen,
  generateLevel,
  MAX_TREE_DIFFICULTY,
  TRIES_BEFORE_HINT,
  type TreeLevel,
} from '../../src/features/computer-skills/activities/climb-the-tall-tree/level.ts';
import { strings } from '../../src/features/computer-skills/activities/climb-the-tall-tree/strings.ts';
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
import { expectVisibleFocus, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 4_004;
/** Two animals to find on a taller tree. */
const TWO_FINDS = 3;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const scroller = (page: Page) => page.locator('.tree-scroller');
const frame = (page: Page) => page.locator('.tree-frame');

/** Whether the whole animal shows in the tree's window. */
async function inView(page: Page, perchId: string): Promise<boolean> {
  const box = await page.locator(`[data-perch="${perchId}"]`).boundingBox();
  const window = await scroller(page).boundingBox();
  if (box === null || window === null) return false;
  return box.y >= window.y && box.y + box.height <= window.y + window.height;
}

async function scrollTop(page: Page): Promise<number> {
  return scroller(page).evaluate((element) => element.scrollTop);
}

async function atGround(page: Page): Promise<boolean> {
  return scroller(page).evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1);
}

/** Turns the real mouse wheel over the tree until the animal shows. */
async function wheelTo(page: Page, perchId: string): Promise<void> {
  const window = await scroller(page).boundingBox();
  if (window === null) throw new Error('The tree is missing');
  await page.mouse.move(window.x + window.width / 2, window.y + window.height / 2);
  for (let turns = 0; turns < 40 && !(await inView(page, perchId)); turns += 1) {
    await page.mouse.wheel(0, -200);
    await expect.poll(() => scrollTop(page)).toBeGreaterThanOrEqual(0);
  }
  expect(await inView(page, perchId)).toBe(true);
}

/** Where an animal is against the tree's window: above it, below it, or wholly inside. */
async function placeOf(page: Page, perchId: string): Promise<'above' | 'below' | 'inside'> {
  const box = await page.locator(`[data-perch="${perchId}"]`).boundingBox();
  const window = await scroller(page).boundingBox();
  if (box === null || window === null) throw new Error('The tree is missing');
  if (box.y < window.y) return 'above';
  if (box.y + box.height > window.y + window.height) return 'below';
  return 'inside';
}

/**
 * Climbs with Page Up while the animal is above the window, then settles with the arrow keys, as
 * a person would: a page is nearly a whole window, so a page can step past an animal.
 */
async function keysTo(page: Page, perchId: string): Promise<void> {
  for (let presses = 0; presses < 40; presses += 1) {
    const place = await placeOf(page, perchId);
    if (place === 'inside') return;
    const before = await scrollTop(page);
    const box = await page.locator(`[data-perch="${perchId}"]`).boundingBox();
    const window = await scroller(page).boundingBox();
    const far = box !== null && window !== null && window.y - box.y > window.height / 2;
    await page.keyboard.press(place === 'below' ? 'ArrowDown' : far ? 'PageUp' : 'ArrowUp');
    await expect.poll(() => scrollTop(page)).not.toBe(before);
  }
  expect(await placeOf(page, perchId)).toBe('inside');
}

function findsOf(level: TreeLevel) {
  return level.finds.map((id) => {
    const perch = level.perches.find((each) => each.id === id);
    if (perch === undefined) throw new Error(`${id} is not on the tree`);
    return perch;
  });
}

forEachBand(activity.bands, (band) => {
  test('starts at the ground, scrolls up with the wheel, and clicks the animal in the picture', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 1, band);
    const next = generateLevel(roundSeed(SEED, 1), 1, band);
    const [target] = findsOf(level);
    if (target === undefined) throw new Error('A tree has an animal to find');

    // "Scroll and find the" and the animal's name.
    await expect(page.locator('.wk-instruction-text')).toContainText(strings.find.text);
    await expectInstructionSpoken(page, strings.find);
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[target.animal].id);
    await expect(page.locator('.tree-card')).toHaveAttribute('data-looking-for', target.animal);
    expect(await atGround(page)).toBe(true);
    expect(await inView(page, target.id)).toBe(false);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await wheelTo(page, target.id);
    await saveBandScreenshot(page, band, `${activity.id}-climbed`);
    const at = await centerOf(page, `[data-perch="${target.id}"]`);
    await page.mouse.click(at.x, at.y);
    await expect(page.locator(`[data-perch="${target.id}"]`)).toHaveAttribute('data-found', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();

    // The next tree starts at the ground again.
    const [nextTarget] = findsOf(next);
    await expect(page.locator('.tree-card')).toHaveAttribute('data-looking-for', nextTarget?.animal ?? '');
    await expect.poll(() => atGround(page)).toBe(true);
  });

  test('the keys scroll the tree, and Enter picks the animal', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: TWO_FINDS });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), TWO_FINDS, band);
    await tabTo(page, scroller(page));
    await expectVisibleFocus(page);
    for (const [index, target] of findsOf(level).entries()) {
      await expect(page.locator('.tree-card')).toHaveAttribute('data-looking-for', target.animal);
      // Home goes to the top of the tree and End back to the ground, then Page Up climbs.
      await scroller(page).focus();
      await page.keyboard.press('Home');
      await expect.poll(() => scrollTop(page)).toBe(0);
      await page.keyboard.press('End');
      await expect.poll(() => atGround(page)).toBe(true);
      await keysTo(page, target.id);
      await tabTo(page, page.locator(`[data-perch="${target.id}"]`));
      await page.keyboard.press('Enter');
      await expect(frame(page)).toHaveAttribute('data-found', String(index + 1));
    }
  });

  test('the scroll bar climbs the tree too', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const window = await scroller(page).boundingBox();
    if (window === null) throw new Error('The tree is missing');
    const geometry = await scroller(page).evaluate((element) => ({
      bar: element instanceof HTMLElement ? element.offsetWidth - element.clientWidth : 0,
      top: element.scrollTop,
    }));
    // A real scroll bar takes room beside the tree.
    expect(geometry.bar).toBeGreaterThan(8);
    // The thumb sits at the bottom; drag it to the top.
    const x = window.x + window.width - geometry.bar / 2 - 2;
    await page.mouse.move(x, window.y + window.height - 30);
    await page.mouse.down();
    await page.mouse.move(x, window.y + 4, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => scrollTop(page)).toBeLessThan(geometry.top / 2);
  });

  test('a wrong animal gets "Look again", and after two the arrow and the voice show the way', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 1, band);
    const [target] = findsOf(level);
    const near = level.perches.find((perch) => !level.finds.includes(perch.id) && !aboveFirstScreen(level, perch));
    if (target === undefined || near === undefined) throw new Error('The first screen has another animal');
    const at = await centerOf(page, `[data-perch="${near.id}"]`);
    for (let tryNumber = 0; tryNumber < TRIES_BEFORE_HINT; tryNumber += 1) await page.mouse.click(at.x, at.y);
    await expect.poll(() => spokenIds(page)).toContain(feedback.lookAgain.id);
    await expect(page.locator('.tree-arrow')).toHaveAttribute('data-direction', 'up');
    await expect.poll(() => spokenIds(page)).toContain(strings.higher.id);
    await expect(page.locator(`[data-perch="${target.id}"]`)).toHaveAttribute('data-hint', 'true');
    await saveBandScreenshot(page, band, `${activity.id}-hint`);
    // Once the animal is in the window, the arrow goes.
    await wheelTo(page, target.id);
    await expect(page.locator('.tree-arrow')).toHaveCount(0);
  });

  test('fits the tallest tree at both review sizes', async () => {
    const level = generateLevel(roundSeed(SEED, 0), MAX_TREE_DIFFICULTY, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: MAX_TREE_DIFFICULTY, size });
      const { page } = launched;
      await expect(page.locator('[data-perch]')).toHaveCount(level.perches.length);
      const box = await page.locator('[data-perch]').first().boundingBox();
      const area = await frame(page).boundingBox();
      if (box === null || area === null) throw new Error('The tree is missing');
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(area.y + area.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
