import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { OsFamily } from '../../src/core/platform/bridge.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/undo-and-redo/activity.ts';
import { generateLevel, type UndoRedoLevel } from '../../src/features/toy-desktop/lessons/undo-and-redo/level.ts';
import { undoRedoSteps } from '../../src/features/toy-desktop/lessons/undo-and-redo/steps.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { clickCenter, saveReviewScreenshot, titleBar, windowOf } from '../support/toyDesktop.ts';
import { expectTargetsAtLeast, lessonRange, pressShortcut } from '../support/toyLessons.ts';

const SEED = 9_870;
const OS: OsFamily = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function instructions(level: UndoRedoLevel): SpokenHandle[] {
  return undoRedoSteps(level, OS).map((step) => {
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

function dotCell(page: Page, level: UndoRedoLevel) {
  if (level.dot === undefined) throw new Error('The round has no music box');
  return windowOf(page, 'music-box').locator(
    `[data-step="${String(level.dot.step)}"][data-note="${String(level.dot.note)}"]`,
  );
}

/** What the child sees change in each app: the last word, or the last dot. */
async function expectChange(page: Page, level: UndoRedoLevel, app: 'notepad' | 'music-box', shown: boolean) {
  if (app === 'notepad') {
    await expect(note(page)).toHaveValue((shown ? level.sentence?.after : level.sentence?.before) ?? '');
  } else {
    await expect(dotCell(page, level)).toHaveAttribute('aria-pressed', String(shown));
  }
}

forEachBand(activity.bands, (band) => {
  test('takes the last change back and brings it back from the Edit menu', async () => {
    const { min } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const said = instructions(level);
    await expectInstructionSpoken(page, said[0] ?? feedback.youDidIt);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);
    let step = 0;
    for (const app of level.apps) {
      await clickCenter(page, titleBar(windowOf(page, app)));
      await expectChange(page, level, app, true);
      await runFromMenu(page, 'edit', 'undo');
      await expectChange(page, level, app, false);
      step += 1;
      await expect.poll(() => spokenIds(page)).toContain(said[step]?.id);
      await runFromMenu(page, 'edit', 'redo');
      await expectChange(page, level, app, true);
      step += 1;
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('takes the last change back and brings it back with the shortcut keys, with no menu bar', async () => {
    const { max } = lessonRange(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    expect(level.route).toBe('keys');
    await expect(page.locator('[data-menu]')).toHaveCount(0);
    const said = instructions(level);
    await expectInstructionSpoken(page, said[0] ?? feedback.youDidIt);
    await saveReviewScreenshot(page, band, `${activity.id}-keys`);
    for (const app of level.apps) {
      await clickCenter(page, titleBar(windowOf(page, app)));
      await pressShortcut(launched, 'Z');
      await expectChange(page, level, app, false);
      await pressShortcut(launched, 'Z', true);
      await expectChange(page, level, app, true);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('undo in the other app gets a nudge each time, then the right window is pointed out', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 3 });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), 3, band);
    expect(level.apps).toEqual(['notepad', 'music-box']);
    await clickCenter(page, titleBar(windowOf(page, 'music-box')));
    await runFromMenu(page, 'edit', 'undo');
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(1);
    await runFromMenu(page, 'edit', 'redo');
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(2);
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(titleBar(windowOf(page, 'notepad'))).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
  });

  test('fits a round with both apps at both review sizes', async () => {
    const level = generateLevel(roundSeed(SEED, 0), 3, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 3, size });
      const { page } = launched;
      await expect(note(page)).toHaveValue(level.sentence?.after ?? '');
      await expectTargetsAtLeast(page, band, '[data-menu], .td-music-cell');
      // The last dot is in view in the music box, without scrolling.
      const cell = await dotCell(page, level).boundingBox();
      const body = await windowOf(page, 'music-box').locator('.td-window-body').boundingBox();
      if (cell === null || body === null) throw new Error('The dot or the music box is missing');
      expect(cell.x + cell.width).toBeLessThanOrEqual(body.x + body.width + 0.5);
      expect(cell.y + cell.height).toBeLessThanOrEqual(body.y + body.height + 0.5);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
