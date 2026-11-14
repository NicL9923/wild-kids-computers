import { expect, test } from '@playwright/test';
import activity from '../../src/features/robot-painter/activities/robot-inventor/activity.ts';
import { steps } from '../../src/features/robot-painter/activities/robot-inventor/level.ts';
import { runProgram } from '../../src/features/robot-painter/engine/interpreter.ts';
import { toDraft } from '../../src/features/robot-painter/engine/program.ts';
import type { Puzzle } from '../../src/features/robot-painter/engine/puzzle.ts';
import { buildProgram } from '../../src/features/robot-painter/engine/validate.ts';
import { strings } from '../../src/features/robot-painter/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, REVIEW_SIZES, saveBandScreenshot } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { enterBlocks, expectTargetsFit, openRobot, playRun, screen, settleRobot } from '../support/robotPainter.ts';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function stepOf(id: string): { index: number; puzzle: Puzzle } {
  const index = steps.findIndex((puzzle) => puzzle.id === id);
  const puzzle = steps[index];
  if (puzzle === undefined) throw new Error(`Tier 3 has no ${id}`);
  return { index, puzzle };
}

forEachBand(activity.bands, (band) => {
  test('teaches the robot the box block, and the program that calls it twice draws both boxes', async () => {
    const { index, puzzle } = stepOf('twinBoxes');
    const start = puzzle.startingProgram;
    const [box] = toDraft(puzzle.solution).definitions;
    const [emptyBox] = start?.definitions ?? [];
    if (start === undefined || box === undefined || emptyBox === undefined) throw new Error('Twin boxes defines a box');
    launched = await openRobot({ activity: activity.id, band, step: index });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', puzzle.id);
    await expectInstructionSpoken(page, strings.doDefine);
    await expect(page.locator('[data-definition="box"]')).toBeVisible();
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The box's body starts empty. Fill it from the toolbox.
    await enterBlocks(page, puzzle.toolbox, start, emptyBox.id, box.body);
    await saveBandScreenshot(page, band, activity.id, 'defined');
    await page.locator('[data-control="go"]').click();
    // While the box runs, its definition lights up with the block inside it.
    await expect(page.locator('.rp-definition-head[data-running="true"]')).toHaveCount(1);
    await playRun(page, puzzle.solution, puzzle.world, band);
    await settleRobot(page);
    await expect(page.locator('.rp-paper')).toHaveAttribute(
      'data-lines',
      String(runProgram(puzzle.solution, puzzle.world).segments.length),
    );
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
    await saveBandScreenshot(page, band, activity.id, 'solved');
    await expectAccessible(page);
  });

  test('click to place: carries forward into a repeat, then sets the values that close the square', async () => {
    const { puzzle } = stepOf('turtleSquare');
    const [loop] = toDraft(puzzle.solution).blocks;
    if (loop?.kind !== 'repeat') throw new Error('Turtle square is one repeat');
    const [forward, turn] = loop.body;
    if (forward?.kind !== 'forward' || turn?.kind !== 'turn') throw new Error('A side and a corner');
    launched = await openRobot({ activity: activity.id, band });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', puzzle.id);

    // Forward first, in the main program, then the repeat with the turn inside it.
    await enterBlocks(page, puzzle.toolbox, buildProgram([]), 'main', [forward, { ...loop, body: [turn] }]);
    const placed = page.locator('[data-list="main"] > li > .rp-block');
    const forwardId = String(await placed.first().getAttribute('data-block-id'));
    const loopId = String(await placed.last().getAttribute('data-block-id'));
    // Click forward to pick it up, and click the gap at the top of the repeat's body.
    await page.locator(`[data-block-id="${forwardId}"] .rp-block-button`).click();
    await page.locator(`[data-gap="${loopId}:0"]`).click();
    await expect(page.locator(`[data-list="${loopId}"] > li > .rp-block`).first()).toHaveAttribute(
      'data-block-id',
      forwardId,
    );

    await page.locator('[data-control="go"]').click();
    await playRun(page, puzzle.solution, puzzle.world, band);
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
  });

  test('fits the flower garden at both review sizes', async () => {
    const { index } = stepOf('flowerGarden');
    for (const size of REVIEW_SIZES) {
      launched = await openRobot({ activity: activity.id, band, step: index, size });
      await expectTargetsFit(launched.page, band, size);
      await saveBandScreenshot(launched.page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
