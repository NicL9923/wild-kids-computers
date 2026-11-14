import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/fix-it/activity.ts';
import { generateLevel, type FixItLevel } from '../../src/features/toy-desktop/lessons/fix-it/level.ts';
import { faultInstruction } from '../../src/features/toy-desktop/lessons/fix-it/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/fix-it/strings.ts';
import type { Fault } from '../../src/features/toy-desktop/model/faults.ts';
import { findWindow } from '../../src/features/toy-desktop/model/state.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot, titleBar } from '../support/toyDesktop.ts';
import { desktopScale } from '../support/toyDesktopLessons.ts';

const SEED = 3_310;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const task = (page: Page, windowId: string) => page.locator(`[data-task-window="${windowId}"]`);
const windowById = (page: Page, windowId: string) => page.locator(`[data-window="${windowId}"]`);

/** A session seed whose first round at this difficulty starts with this problem. */
function seedFor(band: Band, difficulty: number, kind: Fault['kind']): number {
  for (let seed = SEED; seed < SEED + 400; seed += 1) {
    if (generateLevel(roundSeed(seed, 0), difficulty, band).faults[0]?.kind === kind) return seed;
  }
  throw new Error(`No round starts with ${kind}`);
}

/**
 * The point on the part of a window's title bar still on the screen, and how far right to carry
 * it so the window's left edge lands at x 24.
 */
async function offSideGrab(page: Page, level: FixItLevel, windowId: string) {
  const rect = findWindow(level.desktop, windowId)?.rect;
  if (rect === undefined) throw new Error('No such window');
  const scale = await desktopScale(page);
  const desktop = await page.locator('.td-desktop').boundingBox();
  const title = await titleBar(windowById(page, windowId)).boundingBox();
  if (desktop === null || title === null) throw new Error('The window is not on screen');
  const grab = { x: desktop.x + (rect.x + rect.width - 60) * scale, y: title.y + title.height / 2 };
  return { grab, by: (24 - rect.x) * scale };
}

/** Picks the title bar up with a click, moves the pointer, and puts it down with a click. */
async function clickToPlace(page: Page, from: { x: number; y: number }, by: number): Promise<void> {
  await page.mouse.click(from.x, from.y);
  await page.mouse.move(from.x + by / 2, from.y, { steps: 4 });
  await page.mouse.move(from.x + by, from.y, { steps: 4 });
  await page.mouse.click(from.x + by, from.y);
}

/** Fixes one problem with the mouse, as a child would. */
async function fixWithMouse(page: Page, level: FixItLevel, fault: Fault): Promise<void> {
  if (fault.kind === 'sound-muted') {
    await clickCenter(page, page.locator('[data-system-sound]'));
  } else if (fault.kind === 'window-off-side') {
    const { grab, by } = await offSideGrab(page, level, fault.windowId);
    await clickToPlace(page, grab, by);
  } else {
    await clickCenter(page, task(page, fault.windowId));
  }
}

forEachBand(activity.bands, (band) => {
  test('fixes the problem it hears, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const [fault] = level.faults;
    if (fault === undefined) throw new Error('No problem to fix');
    await expectInstructionSpoken(page, faultInstruction(fault));
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);
    await fixWithMouse(page, level, fault);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
    await saveReviewScreenshot(page, band, `${activity.id}-fixed`);
  });

  test('click to place: moves a window back onto the screen by its title bar', async () => {
    const difficulty = 4;
    const seed = seedFor(band, difficulty, 'window-off-side');
    launched = await openActivity({ activity: activity.id, band, seed, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(seed, 0), difficulty, band);
    const [fault] = level.faults;
    if (fault?.kind !== 'window-off-side') throw new Error('The round starts with a window off the side');
    await expectInstructionSpoken(page, strings.offSide);
    await saveReviewScreenshot(page, band, `${activity.id}-off-side`);
    const { grab, by } = await offSideGrab(page, level, fault.windowId);
    await page.mouse.click(grab.x, grab.y);
    await expect(titleBar(windowById(page, fault.windowId))).toHaveAttribute('data-carried', 'true');
    await page.mouse.move(grab.x + by / 2, grab.y, { steps: 4 });
    await page.mouse.move(grab.x + by, grab.y, { steps: 4 });
    await page.mouse.click(grab.x + by, grab.y);
    const box = await windowById(page, fault.windowId).boundingBox();
    const desktop = await page.locator('.td-desktop').boundingBox();
    if (box === null || desktop === null) throw new Error('The window is gone');
    expect(box.x).toBeGreaterThanOrEqual(desktop.x);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('two other windows from the strip get a nudge, then the hidden one is pointed out', async () => {
    const difficulty = 5;
    const seed = seedFor(band, difficulty, 'window-behind');
    launched = await openActivity({ activity: activity.id, band, seed, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(seed, 0), difficulty, band);
    const [fault] = level.faults;
    if (fault?.kind !== 'window-behind') throw new Error('The round starts with a window behind another');
    // The window that is neither hidden nor covering it, then the cover: both are other windows.
    const third = level.desktop.windows.find((each) => each.id !== fault.windowId && each.id !== fault.coveredBy);
    if (third === undefined) throw new Error('Three windows at this difficulty');
    for (const [index, other] of [third.id, fault.coveredBy].entries()) {
      await clickCenter(page, task(page, other));
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(index + 1);
    }
    await expect(task(page, fault.windowId)).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await clickCenter(page, task(page, fault.windowId));
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('can be played with the keyboard alone', async () => {
    const difficulty = 2;
    const seed = seedFor(band, Math.max(difficulty, rangeOf(activity, band).min), 'window-minimized');
    const played = Math.max(difficulty, rangeOf(activity, band).min);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty: played });
    const { page } = launched;
    const level = generateLevel(roundSeed(seed, 0), played, band);
    const [fault] = level.faults;
    if (fault?.kind !== 'window-minimized') throw new Error('The round starts with a minimized window');
    await tabTo(page, task(page, fault.windowId));
    await page.keyboard.press('Enter');
    await expect(windowById(page, fault.windowId)).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fixes two or three problems in a row in the busiest round, at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const level = generateLevel(roundSeed(SEED, 0), max, band);
      await expect(page.locator('.td-desktop[data-measured="true"] [data-window]')).toHaveCount(
        level.desktop.windows.filter((window) => !window.minimized).length,
      );
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      for (const fault of level.faults) {
        await expect.poll(() => spokenIds(page)).toContain(faultInstruction(fault).id);
        await fixWithMouse(page, level, fault);
      }
      await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
      await launched.close();
      launched = undefined;
    }
  });
});
