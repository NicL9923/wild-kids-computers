import { expect, test, type Page } from '@playwright/test';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import type { Band } from '../../src/core/bands.ts';
import activity from '../../src/features/robot-painter/activities/robot-first-steps/activity.ts';
import { steps } from '../../src/features/robot-painter/activities/robot-first-steps/level.ts';
import { runProgram } from '../../src/features/robot-painter/engine/interpreter.ts';
import type { Puzzle } from '../../src/features/robot-painter/engine/puzzle.ts';
import { toDraft } from '../../src/features/robot-painter/engine/program.ts';
import { strings } from '../../src/features/robot-painter/strings.ts';
import { RESULT_PAUSE_MS } from '../../src/features/robot-painter/timing.ts';
import { buildProgram } from '../../src/features/robot-painter/engine/validate.ts';
import { draft as d } from '../../src/features/robot-painter/engine/program.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  kitTime,
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
} from '../support/robotPainter.ts';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function puzzle(index: number): Puzzle {
  const found = steps[index];
  if (found === undefined) throw new Error(`Tier 1 has no step ${String(index)}`);
  return found;
}

/** The arrows of a direct puzzle's solution, pressed one by one. */
async function pressSolution(page: Page, step: Puzzle): Promise<void> {
  for (const block of toDraft(step.solution).blocks) {
    if (block.kind !== 'move') throw new Error('Direct puzzles use arrows only');
    await page.locator(`[data-arrow="${block.direction}"]`).click();
  }
}

/** Enters a build puzzle's solution: arrows into the plan for the youngest, toolbox blocks for older children. */
async function buildSolution(page: Page, band: Band, step: Puzzle): Promise<void> {
  const blocks = toDraft(step.solution).blocks;
  if (band === 'band-3-5') {
    for (const block of blocks) {
      if (block.kind !== 'move') throw new Error('Tier 1 uses arrows only');
      await page.locator(`[data-arrow="${block.direction}"]`).click();
    }
    await expect(page.locator('.rp-plan-block')).toHaveCount(blocks.length);
  } else {
    await enterBlocks(page, step.toolbox, step.startingProgram ?? buildProgram([]), 'main', blocks);
  }
}

forEachBand(activity.bands, (band) => {
  test('moves the robot to the flower with the arrows, then plans a picture and presses go', async () => {
    launched = await openRobot({ activity: activity.id, band });
    const { page } = launched;
    await expectInstructionSpoken(page, strings.doDirect);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The four direct puzzles: each arrow moves the robot at once, and reaching the flower solves it.
    for (let index = 0; index < 4; index++) {
      const step = puzzle(index);
      expect(step.kind).toBe('direct');
      await expect(screen(page)).toHaveAttribute('data-puzzle', step.id);
      await pressSolution(page, step);
      await settleRobot(page);
      const paper = page.locator('.rp-paper');
      await expect(paper).toHaveAttribute('data-robot-x', step.finish.x.toFixed(3));
      await expect(paper).toHaveAttribute('data-robot-y', step.finish.y.toFixed(3));
      await expect(page.locator('[data-choice="next"]')).toBeVisible();
      await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
      if (index === 0) await saveBandScreenshot(page, band, activity.id, 'reached');
      await nextPicture(page);
    }

    // The first plan: arrows go into the plan, and go runs them one at a time.
    const plan = puzzle(4);
    await expect(screen(page)).toHaveAttribute('data-puzzle', plan.id);
    await expectInstructionSpoken(page, band === 'band-3-5' ? strings.doPlan : strings.doBuild);
    await buildSolution(page, band, plan);
    await saveBandScreenshot(page, band, activity.id, 'plan');
    await page.locator('[data-control="go"]').click();
    // The first block lights up while the robot runs it.
    await expect(page.locator('[data-running="true"]')).toHaveCount(1);
    await playRun(page, plan.solution, plan.world, band);
    await expect(page.locator('.rp-paper')).toHaveAttribute(
      'data-lines',
      String(runProgram(plan.solution, plan.world).segments.length),
    );
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
    await saveBandScreenshot(page, band, activity.id, 'solved');
    await expectAccessible(page);
  });

  test('a plan that misses the picture is spoken about, and the robot goes back with the plan kept', async () => {
    const plan = puzzle(4);
    launched = await openRobot({ activity: activity.id, band, step: 4 });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', plan.id);
    const short = buildProgram([d.right()]);
    const [first] = toDraft(short).blocks;
    if (first?.kind !== 'move') throw new Error('fixture');
    if (band === 'band-3-5') await page.locator(`[data-arrow="${first.direction}"]`).click();
    else await enterBlocks(page, plan.toolbox, buildProgram([]), 'main', [first]);

    for (let run = 1; run <= 2; run++) {
      await page.locator('[data-control="go"]').click();
      await playRun(page, short, plan.world, band);
      // The neutral words for a missing line, never a verdict on the child.
      await expect.poll(() => spokenIds(page)).toContain(strings.hintMissingLine.id);
      await kitTime(page).advance(RESULT_PAUSE_MS);
      await expect(page.locator('.rp-paper')).toHaveAttribute('data-robot-x', plan.world.start.x.toFixed(3));
      await expect(page.locator('.rp-paper')).toHaveAttribute('data-lines', '0');
      await expect(page.locator('[data-list="main"] [data-block-id]')).toHaveCount(1);
    }
    // After a couple of runs the paper shows where the line is missing.
    await expect(page.locator('.rp-hints')).toHaveAttribute('data-hints', /missing-line/);
    await saveBandScreenshot(page, band, activity.id, 'hint');
    await expectAccessible(page);
  });

  test('fits the plan screen at both review sizes', async () => {
    for (const size of REVIEW_SIZES) {
      launched = await openRobot({ activity: activity.id, band, step: 4, size });
      await expectTargetsFit(launched.page, band, size);
      await saveBandScreenshot(launched.page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});

test.describe('band-6-8', () => {
  test('click to place: picks up a placed arrow and puts it first, which draws the picture', async () => {
    const band = 'band-6-8';
    const step = puzzle(5);
    launched = await openRobot({ activity: activity.id, band, step: 5 });
    const { page } = launched;
    await expect(screen(page)).toHaveAttribute('data-puzzle', step.id);
    const [up, right] = toDraft(step.solution).blocks;
    if (up === undefined || right === undefined) throw new Error('Up and over has two blocks');
    // The child puts the arrows in the other order.
    await enterBlocks(page, step.toolbox, buildProgram([]), 'main', [right, up]);
    const placed = page.locator('[data-list="main"] > li > .rp-block');
    const second = await placed.nth(1).getAttribute('data-block-id');
    // Click the second arrow to pick it up, then click the gap before the first.
    await page.locator(`[data-block-id="${String(second)}"] .rp-block-button`).click();
    await expect(page.locator(`[data-block-id="${String(second)}"] .rp-block-button`)).toHaveAttribute(
      'data-carried',
      'true',
    );
    await page.locator('[data-gap="main:0"]').click();
    await expect(placed.first()).toHaveAttribute('data-block-id', String(second));
    await page.locator('[data-control="go"]').click();
    await playRun(page, step.solution, step.world, band);
    await expect(page.locator('[data-choice="next"]')).toBeVisible();
  });
});
