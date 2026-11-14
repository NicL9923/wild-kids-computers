import { expect, test, type Locator } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/files-and-folders/activity.ts';
import {
  generateLevel,
  type FilesFoldersLevel,
} from '../../src/features/toy-desktop/lessons/files-and-folders/level.ts';
import { filesFoldersSteps } from '../../src/features/toy-desktop/lessons/files-and-folders/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/files-and-folders/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, saveReviewScreenshot, windowOf } from '../support/toyDesktop.ts';
import { expectHitArea, expectTargetsAtLeast, lessonRange } from '../support/toyLessons.ts';

const SEED = 6_210;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function names(level: FilesFoldersLevel): { file: string; folder: string } {
  const file = level.desktop.fs.nodes[level.fileId]?.name;
  const folder = level.desktop.fs.nodes[level.folderId]?.name;
  if (file === undefined || folder === undefined) throw new Error('The level names no file or folder');
  return { file, folder };
}

/** The one instruction a step says. */
function instructionOf(level: FilesFoldersLevel, step: number): SpokenHandle {
  const handle = filesFoldersSteps(level)[step]?.instruction;
  if (handle === undefined || !('id' in handle)) throw new Error(`Step ${String(step)} has no single instruction`);
  return handle;
}

const item = (explorer: Locator, name: string) => explorer.locator(`[data-item="${name}"]`);

forEachBand(activity.bands, (band) => {
  test('click to place: puts the file in its folder, opens the folder, and makes and names a new one', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    const { file, folder } = names(level);
    const explorer = windowOf(page, 'file-explorer');

    await expect(item(explorer, file)).toBeVisible();
    await expectInstructionSpoken(page, instructionOf(level, 0));
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Click the file's dots to pick it up, then click the folder to put it there.
    const grip = item(explorer, file).locator('.td-item-grip');
    await clickCenter(page, grip);
    await expect(grip).toHaveAttribute('data-carried', 'true');
    await clickCenter(page, item(explorer, folder).locator('.td-item-name'));
    await expect(item(explorer, file)).toHaveCount(0);
    // The placing click puts the file in the folder and nothing more: the folder stays closed.
    await expect(explorer.locator('[data-place="home"]')).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => spokenIds(page)).toContain(instructionOf(level, 1).id);

    // One click opens the folder, and the file is in it.
    await clickCenter(page, item(explorer, folder).locator('.td-item-open'));
    await expect(item(explorer, file)).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.newFolder.id);
    await saveReviewScreenshot(page, band, `${activity.id}-folder`);

    // New folder makes one ready to name. Type a name and press Enter.
    await clickCenter(page, explorer.locator('[data-explorer-command="new-folder"]'));
    const rename = explorer.locator('input[data-text-field="rename"]');
    await expect(rename).toBeFocused();
    await expect.poll(() => spokenIds(page)).toContain(strings.nameFolder.id);
    await page.keyboard.type('Toys');
    await saveReviewScreenshot(page, band, `${activity.id}-name`);
    await expectAccessible(page);
    await page.keyboard.press('Enter');
    await expect(item(explorer, 'Toys')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);

    // The next round's desktop comes from the next round seed.
    await expect(page.locator('[data-lesson-step="0"] [data-window]')).toBeVisible();
    await expect(item(windowOf(page, 'file-explorer'), names(next).file)).toBeVisible();
  });

  test('two wrong tries get a gentle nudge each, then the file’s dots are pointed out', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const { file } = names(level);
    const explorer = windowOf(page, 'file-explorer');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // Clicking the file opens it rather than picking it up.
      await clickCenter(page, item(explorer, file).locator('.td-item-open'));
      const opened = page.locator('[data-window]:not([data-app="file-explorer"])');
      await expect(opened).toHaveCount(1);
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
      await clickCenter(page, opened.locator('[data-window-control="close"]'));
      await expect(opened).toHaveCount(0);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    const grip = item(explorer, file).locator('.td-item-grip');
    await expect(grip).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const { file, folder } = names(level);
    const explorer = windowOf(page, 'file-explorer');
    const grip = item(explorer, file).locator('.td-item-grip');
    await expect(grip).toBeVisible();
    for (let presses = 0; presses < 40; presses += 1) {
      await page.keyboard.press('Tab');
      if (await grip.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(grip).toBeFocused();
    // Enter picks it up, the arrows choose a place, Enter puts it down.
    await page.keyboard.press('Enter');
    await expect(grip).toHaveAttribute('data-carried', 'true');
    for (let presses = 0; presses < 8; presses += 1) {
      const over = await explorer.locator(`[data-item="${folder}"]`).getAttribute('data-carry-over');
      if (over === 'true') break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(item(explorer, folder)).toHaveAttribute('data-carry-over', 'true');
    await page.keyboard.press('Enter');
    await expect(item(explorer, file)).toHaveCount(0);
    await expect.poll(() => spokenIds(page)).toContain(instructionOf(level, 1).id);
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = lessonRange(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const explorer = windowOf(page, 'file-explorer');
      await expect(explorer).toBeVisible();
      await expectTargetsAtLeast(page, band, '[data-desktop-icon], [data-explorer-command], .td-item-open, .td-place');
      // The whole explorer is on the toy screen.
      const box = await explorer.boundingBox();
      const screen = await page.locator('.td-desktop').boundingBox();
      if (box === null || screen === null) throw new Error('The explorer or the desktop is missing');
      expect(box.x).toBeGreaterThanOrEqual(screen.x - 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(screen.y + screen.height + 0.5);
      await expect(explorer.locator('.td-item').first()).toBeVisible();
      // The dots are drawn small, but each takes a click anywhere in a full target.
      await expectHitArea(page, band, explorer.locator('.td-item-grip').first());
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
