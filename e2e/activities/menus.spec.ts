import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/menus/activity.ts';
import { generateLevel } from '../../src/features/toy-desktop/lessons/menus/level.ts';
import { taskInstruction } from '../../src/features/toy-desktop/lessons/menus/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/menus/strings.ts';
import { createToyClipboard } from '../../src/app/inputGuards.ts';
import type { Band } from '../../src/core/bands.ts';
import { APP_MENUS, type MenuId } from '../../src/features/toy-desktop/model/appMenus.ts';
import type { CommandId } from '../../src/features/toy-desktop/model/commands.ts';
import { isCommandEnabled } from '../../src/features/toy-desktop/model/menus.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { expectFocused, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot, smallestTargets } from '../support/toyDesktop.ts';

const SEED = 8_210;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const menuButton = (page: Page, menu: string) => page.locator(`[data-menu="${menu}"]`);
const command = (page: Page, id: string) => page.locator(`[data-command="${id}"]`);

/** Commands a wrong pick may run: they change nothing that would block the right command. */
const HARMLESS: readonly CommandId[] = ['copy', 'clear', 'play', 'previous', 'next'];

/**
 * A session seed whose first round has another command that can run now, for the wrong pick, and
 * that command. Computed from the level, never read from the page.
 */
function seedWithAnotherCommand(
  band: Band,
  difficulty: number,
): { seed: number; wrong: { menu: MenuId; command: CommandId } } {
  for (let seed = SEED; seed < SEED + 200; seed += 1) {
    const level = generateLevel(roundSeed(seed, 0), difficulty, band);
    const asked = level.tasks.map((task) => task.command);
    for (const menu of APP_MENUS[level.app]) {
      const other = menu.commands.find(
        (each) =>
          HARMLESS.includes(each) &&
          !asked.includes(each) &&
          isCommandEnabled(level.desktop, 'w1', each, createToyClipboard()),
      );
      if (other !== undefined) return { seed, wrong: { menu: menu.id, command: other } };
    }
  }
  throw new Error('No round with another command to try');
}

/** Presses replay and waits for every clip of a composed instruction. */
async function expectSequenceSpoken(page: Page, ids: readonly string[]): Promise<void> {
  const before = (await spokenIds(page)).length;
  await page.locator('[data-control="replay"]').click();
  await expect.poll(async () => (await spokenIds(page)).slice(before)).toEqual(ids);
}

forEachBand(activity.bands, (band) => {
  test('opens the named menu, chooses the command, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const [task] = level.tasks;
    if (task === undefined) throw new Error('no task');
    await expect(page.locator(`[data-window][data-app="${level.app}"]`)).toBeVisible();
    await expectSequenceSpoken(
      page,
      taskInstruction(task, level.named, true).map((handle) => handle.id),
    );
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await clickCenter(page, menuButton(page, task.menu));
    await expect(command(page, task.command)).toBeVisible();
    await saveReviewScreenshot(page, band, `${activity.id}-open`);
    await expectAccessible(page);
    await clickCenter(page, command(page, task.command));
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').last()).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('another command is a gentle try, and two of them light up the right menu', async () => {
    const difficulty = 4;
    const { seed, wrong } = seedWithAnotherCommand(band, difficulty);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(seed, 0), difficulty, band);
    const [task] = level.tasks;
    if (task === undefined) throw new Error('no task');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await clickCenter(page, menuButton(page, wrong.menu));
      await clickCenter(page, command(page, wrong.command));
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(attempt + 1);
    }
    await expect.poll(() => spokenIds(page)).toContain(strings.otherCommand.id);
    await expect(menuButton(page, task.menu)).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await clickCenter(page, menuButton(page, task.menu));
    await clickCenter(page, command(page, task.command));
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    const [task] = level.tasks;
    if (task === undefined) throw new Error('no task');
    await tabTo(page, menuButton(page, task.menu));
    await page.keyboard.press('ArrowDown');
    const commands = APP_MENUS[level.app].find((menu) => menu.id === task.menu)?.commands ?? [];
    await expectFocused(command(page, commands[0] ?? 'none'));
    for (let index = 0; index < commands.indexOf(task.command); index += 1) await page.keyboard.press('ArrowDown');
    await expectFocused(command(page, task.command));
    await page.keyboard.press('Enter');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fits at both review sizes with every menu at the band size, and finishes the busiest round', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const level = generateLevel(roundSeed(SEED, 0), max, band);
      const [task] = level.tasks;
      if (task === undefined) throw new Error('no task');
      await clickCenter(page, menuButton(page, task.menu));
      for (const smallest of await smallestTargets(page, '[data-menu], [data-command]')) {
        expect(smallest).toBeGreaterThanOrEqual(band === 'band-6-8' ? 55.5 : 43.5);
      }
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      // The busiest rounds ask for two commands: the second instruction follows the first.
      await clickCenter(page, command(page, task.command));
      const second = level.tasks[1];
      if (second !== undefined) {
        await expect.poll(() => spokenIds(page)).toContain(taskInstruction(second, level.named, false)[0]?.id);
        await clickCenter(page, menuButton(page, second.menu));
        await clickCenter(page, command(page, second.command));
      }
      await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
      await launched.close();
      launched = undefined;
    }
  });
});
