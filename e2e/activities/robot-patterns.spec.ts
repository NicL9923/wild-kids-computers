import { expect, test } from '@playwright/test';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/robot-painter/activities/robot-patterns/activity.ts';
import { steps } from '../../src/features/robot-painter/activities/robot-patterns/level.ts';
import { runProgram } from '../../src/features/robot-painter/engine/interpreter.ts';
import { toDraft } from '../../src/features/robot-painter/engine/program.ts';
import type { Puzzle } from '../../src/features/robot-painter/engine/puzzle.ts';
import { buildProgram } from '../../src/features/robot-painter/engine/validate.ts';
import { strings } from '../../src/features/robot-painter/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import {
  enterBlocks,
  expectTargetsFit,
  nextPicture,
  openRobot,
  playRun,
  screen,
  settleRobot,
  wrongBlock,
} from '../support/robotPainter.ts';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function stepOf(id: string): { index: number; puzzle: Puzzle } {
  const index = steps.findIndex((puzzle) => puzzle.id === id);
  const puzzle = steps[index];
  if (puzzle === undefined) throw new Error(`Tier 2 has no ${id}`);
  return { index, puzzle };
}

forEachBand(activity.bands, (band) => {
  test('builds the big stairs from the toolbox, runs it block by block, and moves on', async () => {
    const { puzzle } = stepOf('bigStairs');
    launched = await openRobot({ activity: activity.id, band });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', puzzle.id);
    await expectInstructionSpoken(page, strings.doBuild);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await enterBlocks(page, puzzle.toolbox, buildProgram([]), 'main', toDraft(puzzle.solution).blocks);
    await page.locator('[data-control="go"]').click();
    await expect(page.locator('[data-block-id][data-running="true"]')).toHaveCount(1);
    await playRun(page, puzzle.solution, puzzle.world, band);
    await settleRobot(page);
    await expect(page.locator('.rp-paper')).toHaveAttribute(
      'data-lines',
      String(runProgram(puzzle.solution, puzzle.world).segments.length),
    );
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
    await saveBandScreenshot(page, band, activity.id, 'solved');
    await nextPicture(page);
    await expect(screen(page)).toHaveAttribute('data-puzzle', stepOf('longLine').puzzle.id);
  });

  test('click to place: finds the wrong arrow in the slide, takes it out, and places the right one', async () => {
    const { index, puzzle } = stepOf('fixTheSlide');
    const start = puzzle.startingProgram;
    if (start === undefined) throw new Error('A fix puzzle starts with a program');
    launched = await openRobot({ activity: activity.id, band, step: index });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', puzzle.id);
    await expectInstructionSpoken(page, strings.doFix);
    await expect(page.locator('[data-list="main"] > li > .rp-block')).toHaveCount(start.blocks.length);

    const wrong = wrongBlock(start, puzzle.solution);
    // Pick up the wrong arrow with a click, and click "take the block out".
    await page.locator(`[data-block-id="${wrong.id}"] .rp-block-button`).click();
    await expect(page.locator('.rp-take-out')).toHaveAttribute('data-ready', 'true');
    await page.locator('.rp-take-out').click();
    await expect(page.locator(`[data-block-id="${wrong.id}"]`)).toHaveCount(0);

    // The right arrow goes in at the end, then a click picks it up and a click puts it in the gap.
    await enterBlocks(page, puzzle.toolbox, start, wrong.list, [wrong.wanted]);
    const added = await page
      .locator(`[data-list="${wrong.list}"] > li > .rp-block`)
      .last()
      .getAttribute('data-block-id');
    await page.locator(`[data-block-id="${String(added)}"] .rp-block-button`).click();
    await saveBandScreenshot(page, band, activity.id, 'carrying');
    await page.locator(`[data-gap="${wrong.list}:${String(wrong.index)}"]`).click();
    await expect(page.locator(`[data-list="${wrong.list}"] > li > .rp-block`).nth(wrong.index)).toHaveAttribute(
      'data-block-id',
      String(added),
    );

    await page.locator('[data-control="go"]').click();
    await playRun(page, puzzle.solution, puzzle.world, band);
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
    await expectAccessible(page);
  });

  test('can be played with the keyboard alone: more repeats make the long line', async () => {
    const { index, puzzle } = stepOf('longLine');
    launched = await openRobot({ activity: activity.id, band, step: index });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', puzzle.id);
    const [startRepeat] = puzzle.startingProgram?.blocks ?? [];
    const [wanted] = puzzle.solution.blocks;
    if (startRepeat?.kind !== 'repeat' || wanted?.kind !== 'repeat') throw new Error('Long line is one repeat');

    const more = page.locator(`[data-block-id="${startRepeat.id}"] > .rp-block-row [data-step="more"]`);
    for (let presses = 0; presses < 60; presses++) {
      await page.keyboard.press('Tab');
      if (await more.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(more).toBeFocused();
    for (let count = startRepeat.count; count < wanted.count; count++) await page.keyboard.press('Enter');
    const go = page.locator('[data-control="go"]');
    for (let presses = 0; presses < 60; presses++) {
      await page.keyboard.press('Tab');
      if (await go.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(go).toBeFocused();
    await page.keyboard.press('Enter');
    await playRun(page, puzzle.solution, puzzle.world, band);
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
  });

  test('fits the hardest fix at both review sizes', async () => {
    const { index } = stepOf('fixTheWindows');
    for (const size of REVIEW_SIZES) {
      launched = await openRobot({ activity: activity.id, band, step: index, size });
      await expectTargetsFit(launched.page, band, size);
      await saveBandScreenshot(launched.page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
