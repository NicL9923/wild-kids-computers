import { expect, test, type Locator, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/trash/activity.ts';
import { generateLevel, type TrashLevel } from '../../src/features/toy-desktop/lessons/trash/level.ts';
import { trashSteps } from '../../src/features/toy-desktop/lessons/trash/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/trash/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, saveReviewScreenshot, windowOf } from '../support/toyDesktop.ts';
import { expectHitArea, expectTargetsAtLeast, lessonRange } from '../support/toyLessons.ts';

const SEED = 7_340;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function pictureName(level: TrashLevel): string {
  const name = level.desktop.fs.nodes[level.fileId]?.name;
  if (name === undefined) throw new Error('The level names no picture');
  return name;
}

function deleteInstruction(level: TrashLevel): SpokenHandle {
  const handle = trashSteps(level)[0]?.instruction;
  if (handle === undefined || !('id' in handle)) throw new Error('The first step has one instruction');
  return handle;
}

const item = (explorer: Locator, name: string) => explorer.locator(`[data-item="${name}"]`);

/** Presses Tab, or Shift+Tab, until the locator has focus. */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab'): Promise<void> {
  for (let presses = 0; presses < 40; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
}

forEachBand(activity.bands, (band) => {
  test('click to place: puts the picture in the trash, opens the trash, and restores it', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    const name = pictureName(level);
    const explorer = windowOf(page, 'file-explorer');

    await expect(item(explorer, name)).toBeVisible();
    await expectInstructionSpoken(page, deleteInstruction(level));
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Click the picture's dots to pick it up, then click Trash to put it there.
    await clickCenter(page, item(explorer, name).locator('.td-item-grip'));
    await clickCenter(page, explorer.locator('[data-place="trash"]'));
    await expect(item(explorer, name)).toHaveCount(0);
    // The placing click puts it in the trash and nothing more: the folder stays open.
    await expect(explorer.locator('[data-place="trash"]')).not.toHaveAttribute('aria-current', 'page');
    await expect.poll(() => spokenIds(page)).toContain(strings.openTrash.id);

    await clickCenter(page, explorer.locator('[data-place="trash"]'));
    await expect(item(explorer, name)).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.restore.id);
    await saveReviewScreenshot(page, band, `${activity.id}-restore`);
    await expectAccessible(page);

    // One click picks it, and Restore brings it back.
    await clickCenter(page, item(explorer, name).locator('.td-item-open'));
    await expect(item(explorer, name)).toHaveAttribute('data-selected', 'true');
    await clickCenter(page, explorer.locator('[data-explorer-command="restore"]'));
    await expect(item(explorer, name)).toHaveCount(0);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);

    // The next round's desktop comes from the next round seed.
    await expect(page.locator('[data-lesson-step="0"] [data-window]')).toBeVisible();
    await expect(item(windowOf(page, 'file-explorer'), pictureName(next))).toBeVisible();
  });

  test('two wrong tries get a gentle nudge each, then the picture’s dots are pointed out', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const name = pictureName(level);
    const explorer = windowOf(page, 'file-explorer');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // Clicking the picture opens it rather than picking it up.
      await clickCenter(page, item(explorer, name).locator('.td-item-open'));
      const viewer = windowOf(page, 'picture-viewer');
      await expect(viewer).toBeVisible();
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
      await clickCenter(page, viewer.locator('[data-window-control="close"]'));
      await expect(viewer).toHaveCount(0);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(item(explorer, name).locator('.td-item-grip')).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const name = pictureName(level);
    const explorer = windowOf(page, 'file-explorer');
    const trash = explorer.locator('[data-place="trash"]');

    // Enter picks the picture up, the arrows choose Trash, Enter puts it there.
    await tabTo(page, item(explorer, name).locator('.td-item-grip'));
    await page.keyboard.press('Enter');
    for (let presses = 0; presses < 8; presses += 1) {
      if ((await trash.getAttribute('data-carry-over')) === 'true') break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(trash).toHaveAttribute('data-carry-over', 'true');
    await page.keyboard.press('Enter');
    await expect(item(explorer, name)).toHaveCount(0);

    await tabTo(page, trash, 'Shift+Tab');
    await page.keyboard.press('Enter');
    const inTrash = item(explorer, name).locator('.td-item-open');
    await tabTo(page, inTrash);
    await expect(item(explorer, name)).toHaveAttribute('data-selected', 'true');
    await tabTo(page, explorer.locator('[data-explorer-command="restore"]'), 'Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(item(explorer, name)).toHaveCount(0);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = lessonRange(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const explorer = windowOf(page, 'file-explorer');
      await expect(item(explorer, pictureName(level))).toBeVisible();
      await expectTargetsAtLeast(page, band, '[data-desktop-icon], [data-explorer-command], .td-item-open, .td-place');
      await expectHitArea(page, band, item(explorer, pictureName(level)).locator('.td-item-grip'));
      // Every picture in the folder is in view without scrolling.
      const list = await explorer.locator('.td-items').boundingBox();
      if (list === null) throw new Error('The list is missing');
      for (const shown of await explorer.locator('.td-item').all()) {
        const box = await shown.boundingBox();
        if (box === null) throw new Error('An item is missing');
        expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height + 0.5);
      }
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
