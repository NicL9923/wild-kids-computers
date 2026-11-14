import { expect, test } from '@playwright/test';
import activity from '../../src/features/toy-desktop/activities/toy-desktop-free-play/activity.ts';
import { strings } from '../../src/features/toy-desktop/activities/toy-desktop-free-play/strings.ts';
import { generateLevel } from '../../src/features/toy-desktop/activities/toy-desktop-free-play/level.ts';
import { SAMPLE_PICTURE_IDS } from '../../src/features/toy-desktop/model/sampleContent.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import {
  clickCenter,
  desktopIcon,
  moveWindowByClicks,
  saveReviewScreenshot,
  smallestTargets,
  titleBar,
  windowControl,
  windowOf,
} from '../support/toyDesktop.ts';

const SEED = 7_301;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** The primary modifier on the test machine. Linux CI uses Ctrl, like Windows. */
const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

const TARGET_MIN = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 } as const;

forEachBand(activity.bands, (band) => {
  const level = generateLevel(SEED, band);
  const icons = level.parts.icons ?? [];

  test('shows the toy computer with the icons of the band, and says what to do', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED });
    const { page } = launched;
    await expect(page.locator('[data-desktop-icon]')).toHaveCount(icons.length);
    await expectInstructionSpoken(page, strings.instruction);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);
  });

  test('fits the screen with targets of the band at both review sizes', async () => {
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, size });
      const { page } = launched;
      await clickCenter(page, page.locator('[data-desktop-icon]').nth(1));
      await expect(page.locator('[data-window]')).toHaveCount(1);
      const monitor = await page.locator('.td-screen').boundingBox();
      if (monitor === null) throw new Error('The toy computer is missing');
      expect(monitor.y + monitor.height).toBeLessThanOrEqual(size.height);
      expect(monitor.x + monitor.width).toBeLessThanOrEqual(size.width);
      const sizes = await smallestTargets(page, '[data-desktop-icon], [data-window-control]');
      for (const smallest of sizes) expect(smallest).toBeGreaterThanOrEqual(TARGET_MIN[band] - 0.5);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});

test.describe('band-3-5', () => {
  const band = 'band-3-5';

  test('opens the music box filling the screen, plays with a note, and closes it', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED });
    const { page } = launched;
    await clickCenter(page, desktopIcon(page, 'app:music-box'));
    const box = windowOf(page, 'music-box');
    await expect(box).toHaveAttribute('data-maximized', 'true');
    // Only the close button, big: nothing else to read or lose.
    await expect(box.locator('[data-window-control]')).toHaveCount(1);
    const cell = box.locator('[data-step="0"][data-note="2"]');
    await clickCenter(page, cell);
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-music-box`);
    await expectAccessible(page);
    await clickCenter(page, windowControl(box, 'close'));
    await expect(page.locator('[data-window]')).toHaveCount(0);
  });

  test('the picture icon opens a bundled picture, and next shows another', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED });
    const { page } = launched;
    await clickCenter(page, desktopIcon(page, 'app:picture-viewer'));
    const viewer = windowOf(page, 'picture-viewer');
    await expect(viewer.locator('[data-picture]')).toHaveAttribute('data-picture', 'sunflower');
    await clickCenter(page, viewer.locator('[data-viewer-step="next"]'));
    const shown = await viewer.locator('[data-picture]').getAttribute('data-picture');
    expect(SAMPLE_PICTURE_IDS).toContain(shown);
    expect(shown).not.toBe('sunflower');
    await saveReviewScreenshot(page, band, `${activity.id}-pictures`);
  });
});

for (const band of ['band-6-8', 'band-9-12'] as const) {
  test.describe(`${band} computer`, () => {
    test('types in the notepad, saves with a name, and finds the file in the file explorer', async () => {
      launched = await openActivity({ activity: activity.id, band, seed: SEED });
      const { page } = launched;
      await clickCenter(page, desktopIcon(page, 'app:notepad'));
      const notepad = windowOf(page, 'notepad');
      const text = notepad.locator('textarea');
      await expect(text).toBeFocused();
      await page.keyboard.type('A fox in a box');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('x!');
      await expect(text).toHaveValue('A fox in a box!');
      await expect(notepad.locator('.td-unsaved')).toBeVisible();

      // Save opens the save dialog for a new note. Type a name and press Enter.
      await page.keyboard.press(`${PRIMARY}+S`);
      const dialog = page.locator('[data-file-dialog="save-as"]');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('input')).toBeFocused();
      await page.keyboard.type('Fox story');
      await saveReviewScreenshot(page, band, `${activity.id}-save`);
      await expectAccessible(page);
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(notepad.locator('.td-title-text')).toHaveText('Fox story');
      await expect(notepad.locator('.td-unsaved')).toHaveCount(0);
      await clickCenter(page, windowControl(notepad, 'close'));
      await expect(page.locator('[data-window]')).toHaveCount(0);

      // The file explorer shows it at home, and one click opens it again.
      await clickCenter(page, desktopIcon(page, 'app:file-explorer'));
      const explorer = windowOf(page, 'file-explorer');
      const item = explorer.locator('[data-item="Fox story"]');
      await expect(item).toBeVisible();
      await saveReviewScreenshot(page, band, `${activity.id}-files`);
      await expectAccessible(page);
      await clickCenter(page, item.locator('.td-item-open'));
      await expect(page.locator('[data-window][data-focused="true"]')).toHaveAttribute('data-app', 'notepad');
      await expect(windowOf(page, 'notepad').locator('textarea')).toHaveValue('A fox in a box!');
    });

    test('click to place: picks a window up by its title bar and puts it down somewhere else', async () => {
      launched = await openActivity({ activity: activity.id, band, seed: SEED });
      const { page } = launched;
      await clickCenter(page, desktopIcon(page, 'app:calculator'));
      const calculator = windowOf(page, 'calculator');
      const { before, after } = await moveWindowByClicks(page, calculator, { x: 220, y: 90 });
      expect(after.x - before.x).toBeCloseTo(220, -1);
      expect(after.y - before.y).toBeCloseTo(90, -1);

      // The keyboard moves it too: Enter picks it up, arrows move it, Enter puts it down.
      await titleBar(calculator).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      const moved = await calculator.boundingBox();
      expect(moved?.x).toBeCloseTo(after.x - 48, -1);

      // The calculator works by keyboard while its window is in front.
      await page.keyboard.type('12+30=');
      await expect(calculator.locator('[data-calculator-display]')).toHaveText('42');
    });

    test('resizes a window from its corner by click and click', async () => {
      launched = await openActivity({ activity: activity.id, band, seed: SEED });
      const { page } = launched;
      await clickCenter(page, desktopIcon(page, 'app:notepad'));
      const notepad = windowOf(page, 'notepad');
      const before = await notepad.boundingBox();
      const handle = notepad.locator('.td-resize');
      const at = await handle.boundingBox();
      if (before === null || at === null) throw new Error('The notepad is missing');
      await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.move(at.x + at.width / 2 + 120, at.y + at.height / 2 + 60, { steps: 4 });
      await page.mouse.click(at.x + at.width / 2 + 120, at.y + at.height / 2 + 60);
      const after = await notepad.boundingBox();
      expect(after?.width).toBeCloseTo(before.width + 120, -1);
      expect(after?.height).toBeCloseTo(before.height + 60, -1);
    });

    test('text copied in the notepad never reaches the system clipboard', async () => {
      launched = await openActivity({ activity: activity.id, band, seed: SEED });
      const { page, app } = launched;
      await app.evaluate(({ clipboard }) => clipboard.writeText('grown-up words'));
      await clickCenter(page, desktopIcon(page, 'app:notepad'));
      const text = windowOf(page, 'notepad').locator('textarea');
      await expect(text).toBeFocused();
      await page.keyboard.type('pond');
      await page.keyboard.press(`${PRIMARY}+A`);
      await page.keyboard.press(`${PRIMARY}+C`);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press(`${PRIMARY}+V`);
      // The toy clipboard pasted it; the system clipboard never saw it.
      await expect(text).toHaveValue('pondpond');
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('grown-up words');

      // The Edit menu runs the same commands, with the modifier of this computer.
      await page.locator('[data-menu="edit"]').click();
      const paste = page.locator('[data-command="paste"]');
      await expect(paste).toHaveAttribute('aria-disabled', 'false');
      await expect(paste.locator('kbd').first()).toHaveText(process.platform === 'darwin' ? 'Command' : 'Ctrl');
      await saveReviewScreenshot(page, band, `${activity.id}-menu`);
      await expectAccessible(page);
      await paste.click();
      await expect(text).toHaveValue('pondpondpond');
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('grown-up words');
    });

    test('works with the keyboard alone: open an app, use a menu, and switch windows', async () => {
      launched = await openActivity({ activity: activity.id, band, seed: SEED });
      const { page } = launched;
      await desktopIcon(page, 'app:notepad').focus();
      await page.keyboard.press('Enter');
      await expect(windowOf(page, 'notepad').locator('textarea')).toBeFocused();
      await page.keyboard.type('hi');
      await desktopIcon(page, 'app:music-box').focus();
      await page.keyboard.press('Enter');
      await expect(windowOf(page, 'music-box')).toHaveAttribute('data-focused', 'true');
      // The task strip brings the notepad back to the front, with focus in its text.
      await page.locator('[data-task-window]').first().focus();
      await page.keyboard.press('Enter');
      await expect(windowOf(page, 'notepad')).toHaveAttribute('data-focused', 'true');
      await expect(windowOf(page, 'notepad').locator('textarea')).toBeFocused();
      // The File menu opens with the arrow key and runs Close with Enter.
      await page.locator('[data-menu="file"]').focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-command="new"]')).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.locator('[data-command="close"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-window][data-app="notepad"]')).toHaveCount(0);
    });
  });
}
