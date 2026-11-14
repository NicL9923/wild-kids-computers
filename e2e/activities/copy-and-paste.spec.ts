import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { OsFamily } from '../../src/core/platform/bridge.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/copy-and-paste/activity.ts';
import {
  ANSWER_LEAD,
  generateLevel,
  type CopyPasteLevel,
} from '../../src/features/toy-desktop/lessons/copy-and-paste/level.ts';
import { copyPasteSteps } from '../../src/features/toy-desktop/lessons/copy-and-paste/steps.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, saveReviewScreenshot, windowOf } from '../support/toyDesktop.ts';
import { expectTargetsAtLeast, expectWholeApp, lessonRange, pressShortcut } from '../support/toyLessons.ts';

const SEED = 9_030;
const OS: OsFamily = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function instructions(level: CopyPasteLevel): SpokenHandle[] {
  return copyPasteSteps(level, OS).map((step) => {
    const handle = step.instruction;
    if (handle === undefined || !('id' in handle)) throw new Error('Each step has one instruction');
    return handle;
  });
}

async function runFromMenu(page: Page, menu: string, command: string): Promise<void> {
  await clickCenter(page, page.locator(`[data-menu="${menu}"]`));
  await clickCenter(page, page.locator(`[data-command="${command}"]`));
}

const note = (page: Page) => windowOf(page, 'notepad').locator('textarea');
const display = (page: Page) => windowOf(page, 'calculator').locator('[data-calculator-display]');

forEachBand(activity.bands, (band) => {
  test('moves the number between the apps from the Edit menu', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.route).toBe('menu');
    const said = instructions(level);
    await expectInstructionSpoken(page, said[0] ?? feedback.youDidIt);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    if (level.direction === 'calculator-to-note') {
      await expect(display(page)).toHaveText(level.number);
      await clickCenter(page, display(page));
      await runFromMenu(page, 'edit', 'copy');
      await expect.poll(() => spokenIds(page)).toContain(said[1]?.id);
      await clickCenter(page, note(page));
      await runFromMenu(page, 'edit', 'paste');
      await expect(note(page)).toHaveValue(new RegExp(`^${ANSWER_LEAD}.*${level.number}`));
    } else {
      await expect(note(page)).toHaveValue(level.number);
      await clickCenter(page, note(page));
      await runFromMenu(page, 'edit', 'select-all');
      await expect.poll(() => spokenIds(page)).toContain(said[1]?.id);
      await runFromMenu(page, 'edit', 'copy');
      await expect.poll(() => spokenIds(page)).toContain(said[2]?.id);
      await saveReviewScreenshot(page, band, `${activity.id}-paste`);
      await clickCenter(page, display(page));
      await runFromMenu(page, 'edit', 'paste');
      await expect(display(page)).toHaveText(level.number);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('moves the number with the shortcut keys of this computer, with no menu bar', async () => {
    const { max } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const app = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    expect(level.route).toBe('keys');
    await expect(page.locator('[data-menu]')).toHaveCount(0);
    const said = instructions(level);
    await expectInstructionSpoken(page, said[0] ?? feedback.youDidIt);
    await saveReviewScreenshot(page, band, `${activity.id}-keys`);

    if (level.direction === 'calculator-to-note') {
      await clickCenter(page, display(page));
      await pressShortcut(app, 'C');
      await expect.poll(() => spokenIds(page)).toContain(said[1]?.id);
      await clickCenter(page, note(page));
      await pressShortcut(app, 'V');
      await expect(note(page)).toHaveValue(new RegExp(level.number));
    } else {
      await clickCenter(page, note(page));
      await pressShortcut(app, 'A');
      await expect.poll(() => spokenIds(page)).toContain(said[1]?.id);
      await pressShortcut(app, 'C');
      await expect.poll(() => spokenIds(page)).toContain(said[2]?.id);
      await clickCenter(page, display(page));
      await pressShortcut(app, 'V');
      await expect(display(page)).toHaveText(level.number);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('two pastes in the wrong app get a nudge each, then the note is pointed out', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: 3 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), 3, band);
    expect(level.direction).toBe('calculator-to-note');
    await clickCenter(page, display(page));
    await pressShortcut(launched, 'C');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await pressShortcut(launched, 'V');
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(attempt + 1);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(windowOf(page, 'notepad').locator('.td-title')).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
  });

  test('fits the round at both review sizes', async () => {
    const { min } = lessonRange(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min, size });
      const { page } = launched;
      await expect(display(page)).toBeVisible();
      await expectTargetsAtLeast(page, band, '[data-menu], [data-calculator-key]');
      // Both windows are whole on the toy screen, side by side.
      const screen = await page.locator('.td-desktop').boundingBox();
      const left = await windowOf(page, 'notepad').boundingBox();
      const right = await windowOf(page, 'calculator').boundingBox();
      if (screen === null || left === null || right === null) throw new Error('A window is missing');
      expect(left.x + left.width).toBeLessThanOrEqual(right.x);
      await expectWholeApp(windowOf(page, 'calculator'));
      expect(Math.max(left.y + left.height, right.y + right.height)).toBeLessThanOrEqual(screen.y + screen.height);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
