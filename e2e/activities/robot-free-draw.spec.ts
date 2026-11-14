import { expect, test, type Page } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import activity from '../../src/features/robot-painter/activities/robot-free-draw/activity.ts';
import { generateLevel } from '../../src/features/robot-painter/activities/robot-free-draw/level.ts';
import { PEN_COLOR_VALUES } from '../../src/features/robot-painter/engine/colors.ts';
import { toPaintPicture } from '../../src/features/robot-painter/engine/drawing.ts';
import { runProgram } from '../../src/features/robot-painter/engine/interpreter.ts';
import { draft as d, type BlockDraft } from '../../src/features/robot-painter/engine/program.ts';
import { buildProgram } from '../../src/features/robot-painter/engine/validate.ts';
import { strings } from '../../src/features/robot-painter/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, REVIEW_SIZES, saveBandScreenshot } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { enterBlocks, expectTargetsFit, openRobot, playRun, settleRobot } from '../support/robotPainter.ts';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** What each band draws: a corner in two colors, with blocks that band's toolbox has. */
function drawingFor(band: Band): BlockDraft[] {
  if (band === 'band-9-12') return [d.forward(3), d.turnRight(90), d.color('red'), d.forward(4)];
  // The middle band starts in the bottom left corner, so the corner goes up.
  if (band === 'band-6-8') return [d.right(), d.right(), d.color('red'), d.up()];
  return [d.right(), d.right(), d.color('red'), d.down()];
}

/** Draws with real clicks: arrows and colors at once for the youngest, a program and go for the rest. */
async function draw(page: Page, band: Band, blocks: readonly BlockDraft[]): Promise<void> {
  const mode = generateLevel(0, band);
  if (mode.style === 'direct') {
    for (const block of blocks) {
      if (block.kind === 'move') await page.locator(`[data-arrow="${block.direction}"]`).click();
      else if (block.kind === 'color') await page.locator(`[data-color="${block.color}"]`).click();
      else throw new Error('The youngest children draw with arrows and colors');
    }
    await settleRobot(page);
    return;
  }
  await enterBlocks(page, mode.toolbox, buildProgram([]), 'main', blocks);
  await page.locator('[data-control="go"]').click();
  await playRun(page, buildProgram(blocks), mode.world, band);
}

/** The RGB of a document pixel on the paint studio's canvas. */
async function studioPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
      const data = canvas?.getContext('2d')?.getImageData(px, py, 1, 1).data;
      return data === undefined ? [] : [...data].slice(0, 3);
    },
    { px: Math.round(x), py: Math.round(y) },
  );
}

forEachBand(activity.bands, (band) => {
  test('draws a picture, and "paint it" opens the paint studio with those lines', async () => {
    const mode = generateLevel(0, band);
    const blocks = drawingFor(band);
    launched = await openRobot({ activity: activity.id, band });
    const { page } = launched;
    await expectInstructionSpoken(page, mode.style === 'direct' ? strings.doFreeDirect : strings.doFreeBuild);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await draw(page, band, blocks);
    const run = runProgram(buildProgram(blocks), mode.world);
    await expect(page.locator('.rp-paper')).toHaveAttribute('data-lines', String(run.segments.length));
    await saveBandScreenshot(page, band, activity.id, 'drawn');
    await expectAccessible(page);

    await page.locator('[data-control="paint-it"]').click();
    await expect(page.locator('canvas[data-layer="paint"]')).toBeVisible();
    // Each line lands on the studio's paper in its own pen color, at the middle of where it belongs.
    const picture = toPaintPicture(run.segments, mode.world.canvas);
    for (const line of picture.lines) {
      const middle = { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 };
      await expect
        .poll(() => studioPixel(page, middle.x, middle.y))
        .toEqual([line.color.r, line.color.g, line.color.b]);
    }
    expect(new Set(picture.lines.map((line) => line.color))).toEqual(
      new Set([PEN_COLOR_VALUES.blue, PEN_COLOR_VALUES.red]),
    );
  });

  test('fits the screen at both review sizes', async () => {
    for (const size of REVIEW_SIZES) {
      launched = await openRobot({ activity: activity.id, band, size });
      await expectTargetsFit(launched.page, band, size);
      await saveBandScreenshot(launched.page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});

test.describe('band-6-8', () => {
  test('click to place: moves the up arrow first, and the robot draws the other corner', async () => {
    const band = 'band-6-8';
    const mode = generateLevel(0, band);
    launched = await openRobot({ activity: activity.id, band });
    const { page } = launched;
    await enterBlocks(page, mode.toolbox, buildProgram([]), 'main', [d.right(), d.up()]);
    const placed = page.locator('[data-list="main"] > li > .rp-block');
    const up = String(await placed.last().getAttribute('data-block-id'));
    await page.locator(`[data-block-id="${up}"] .rp-block-button`).click();
    await page.locator('[data-gap="main:0"]').click();
    await expect(placed.first()).toHaveAttribute('data-block-id', up);

    const reordered = buildProgram([d.up(), d.right()]);
    await page.locator('[data-control="go"]').click();
    await playRun(page, reordered, mode.world, band);
    // The first line now goes up from the start.
    const first = page.locator('.rp-drawing line').first();
    await expect(first).toHaveAttribute('x1', String(mode.world.start.x));
    await expect(first).toHaveAttribute('x2', String(mode.world.start.x));
    await expect(first).toHaveAttribute('y2', String(mode.world.start.y - 1));
  });
});
