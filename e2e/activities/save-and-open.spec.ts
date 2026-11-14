import { expect, test, type Locator, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/save-and-open/activity.ts';
import { generateLevel, NOTES_FOLDER } from '../../src/features/toy-desktop/lessons/save-and-open/level.ts';
import { strings } from '../../src/features/toy-desktop/lessons/save-and-open/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, desktopIcon, saveReviewScreenshot, windowControl, windowOf } from '../support/toyDesktop.ts';
import { expectTargetsAtLeast, lessonRange, PRIMARY, pressShortcut } from '../support/toyLessons.ts';

const SEED = 8_120;
const NAME = 'My day';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** Opens a menu of the app in front and runs one of its commands with the mouse. */
async function runFromMenu(page: Page, menu: string, command: string): Promise<void> {
  await clickCenter(page, page.locator(`[data-menu="${menu}"]`));
  await clickCenter(page, page.locator(`[data-command="${command}"]`));
}

const dialog = (page: Page, mode: 'save-as' | 'open') => page.locator(`[data-file-dialog="${mode}"]`);
const dialogItem = (box: Locator, name: string) => box.locator(`[data-dialog-item="${name}"]`);

forEachBand(activity.bands, (band) => {
  test('saves the note with a name, closes it, and opens it again', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const notepad = windowOf(page, 'notepad');
    await expect(notepad.locator('textarea')).toHaveValue(level.text);
    await expectInstructionSpoken(page, strings.save);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // File, then Save, asks for a name, since the note was never saved.
    await runFromMenu(page, 'file', 'save');
    const saving = dialog(page, 'save-as');
    await expect(saving.locator('input')).toBeFocused();
    await expect.poll(() => spokenIds(page)).toContain(strings.name.id);
    await page.keyboard.type(NAME);
    await saveReviewScreenshot(page, band, `${activity.id}-save`);
    await expectAccessible(page);
    await clickCenter(page, saving.locator('[data-dialog-action="confirm"]'));
    await expect(saving).toHaveCount(0);
    await expect(notepad.locator('.td-title-text')).toHaveText(NAME);

    await expect.poll(() => spokenIds(page)).toContain(strings.close.id);
    await clickCenter(page, windowControl(notepad, 'close'));
    await expect(page.locator('[data-window]')).toHaveCount(0);

    // A new notepad, File, Open: the note is there by its name.
    await expect.poll(() => spokenIds(page)).toContain(strings.reopen.id);
    await clickCenter(page, desktopIcon(page, 'app:notepad'));
    await runFromMenu(page, 'file', 'open');
    const opening = dialog(page, 'open');
    await clickCenter(page, dialogItem(opening, NAME));
    await saveReviewScreenshot(page, band, `${activity.id}-open`);
    await expectAccessible(page);
    await clickCenter(page, opening.locator('[data-dialog-action="confirm"]'));
    await expect(windowOf(page, 'notepad').locator('textarea')).toHaveValue(level.text);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('a save in the wrong folder gets a nudge each time, then the File menu is pointed out', async () => {
    const { max } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    expect(level.folderId).not.toBeNull();
    await runFromMenu(page, 'file', 'save');
    await expect.poll(() => spokenIds(page)).toContain(strings.nameInNotes.id);
    // Saved at home, not in Notes: one try. Again with Save as: a second.
    for (const [command, name] of [
      ['save', NAME],
      ['save-as', `${NAME} 2`],
    ] as const) {
      if (command === 'save-as') await runFromMenu(page, 'file', 'save-as');
      const saving = dialog(page, 'save-as');
      await expect(saving.locator('input')).toBeFocused();
      await page.keyboard.press(`${PRIMARY}+A`);
      await page.keyboard.type(name);
      await page.keyboard.press('Enter');
      await expect(saving).toHaveCount(0);
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').last()).toBeVisible();
    }
    await expect(page.locator('[data-menu="file"]')).toHaveAttribute('data-highlight', 'true');

    // Save as into Notes finishes the step.
    await runFromMenu(page, 'file', 'save-as');
    const saving = dialog(page, 'save-as');
    await clickCenter(page, dialogItem(saving, NOTES_FOLDER));
    await saveReviewScreenshot(page, band, `${activity.id}-notes`);
    await clickCenter(page, saving.locator('[data-dialog-action="confirm"]'));
    await expect.poll(() => spokenIds(page)).toContain(strings.close.id);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const text = windowOf(page, 'notepad').locator('textarea');
    await expect(text).toHaveValue(level.text);
    await text.focus();
    await page.keyboard.press(`${PRIMARY}+S`);
    await expect(dialog(page, 'save-as').locator('input')).toBeFocused();
    await page.keyboard.type(NAME);
    await page.keyboard.press('Enter');
    await expect(dialog(page, 'save-as')).toHaveCount(0);
    // Native input, the path a real keyboard takes, so the main process's shortcut block sees it.
    await pressShortcut(launched, 'W');
    await expect(page.locator('[data-window]')).toHaveCount(0);

    // Focus goes to the desktop when the last window closes. Enter opens the notepad.
    await expect(desktopIcon(page, 'app:notepad')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(windowOf(page, 'notepad').locator('textarea')).toBeFocused();
    await page.keyboard.press(`${PRIMARY}+O`);
    const opening = dialog(page, 'open');
    const mine = dialogItem(opening, NAME);
    for (let presses = 0; presses < 20; presses += 1) {
      if (await mine.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(mine).toHaveAttribute('aria-pressed', 'true');
    const confirm = opening.locator('[data-dialog-action="confirm"]');
    for (let presses = 0; presses < 20; presses += 1) {
      if (await confirm.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(windowOf(page, 'notepad').locator('textarea')).toHaveValue(level.text);
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fits the busiest round of the band at both review sizes', async () => {
    const { max } = lessonRange(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      await runFromMenu(page, 'file', 'save');
      const saving = dialog(page, 'save-as');
      await expect(dialogItem(saving, NOTES_FOLDER)).toBeVisible();
      await expectTargetsAtLeast(
        page,
        band,
        '[data-desktop-icon], [data-menu], [data-dialog-item], [data-dialog-action]',
      );
      // The whole dialog is on the toy screen.
      const box = await saving.boundingBox();
      const screen = await page.locator('.td-desktop').boundingBox();
      if (box === null || screen === null) throw new Error('The dialog or the desktop is missing');
      expect(box.y + box.height).toBeLessThanOrEqual(screen.y + screen.height + 0.5);
      await saveReviewScreenshot(page, band, `${activity.id}-save`, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
