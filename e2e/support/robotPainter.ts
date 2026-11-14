import { expect, type Page } from '@playwright/test';
import { BETWEEN_ROUNDS_MS } from '../../src/activityShell/timing.ts';
import type { Band } from '../../src/core/bands.ts';
import { documentNames } from '../../src/core/platform/names.ts';
import { saveDocument } from '../../src/core/storage/document.ts';
import { progressDocument } from '../../src/core/storage/schemas.ts';
import { blockValue, paletteFor, valueChoices } from '../../src/features/robot-painter/editor/palette.ts';
import { runProgram, type World } from '../../src/features/robot-painter/engine/interpreter.ts';
import { toDraft, type Block, type BlockDraft, type Program } from '../../src/features/robot-painter/engine/program.ts';
import type { ToolboxItem } from '../../src/features/robot-painter/engine/toolbox.ts';
import type { ValidProgram } from '../../src/features/robot-painter/engine/validate.ts';
import { stepPause } from '../../src/features/robot-painter/timing.ts';
import { goToActivity, kitTime, resizeWindow, sessionLengthSetup } from './activity.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp } from './launchApp.ts';

/**
 * Helpers for the robot painter's end-to-end specs. Every answer comes from a puzzle module's
 * reference solution; the helpers turn it into the clicks a child would make.
 */

/** The fixed wall time the specs pin the kit clock at. */
const PINNED_AT = Date.UTC(2026, 10, 14, 9, 0, 0);

export interface OpenRobotOptions {
  readonly activity: string;
  readonly band: Band;
  /** Opens this step through the step picker, as a child who reached it would. */
  readonly step?: number;
  readonly size?: { readonly width: number; readonly height: number };
  /** The parent's session length in minutes. */
  readonly sessionMinutes?: number;
}

async function progressText(activity: string, furthestStep: number): Promise<string> {
  let text = '';
  await saveDocument(
    {
      write: (_name, written) => {
        text = written;
        return Promise.resolve();
      },
    },
    documentNames.progress(FIXTURE_PROFILE.id),
    progressDocument,
    { version: 1, activities: { [activity]: { recentRounds: [], daysPracticed: [], furthestStep } } },
  );
  return text;
}

/**
 * Launches the app at 1280 by 800 with the kit clock pinned and opens a robot painter activity.
 * With `step`, the child has reached that step before, so the step picker opens and the helper
 * picks it.
 */
export async function openRobot(options: OpenRobotOptions): Promise<LaunchedApp> {
  const documents = {
    ...sessionLengthSetup(options.sessionMinutes).documents,
    ...(options.step === undefined || options.step === 0
      ? {}
      : { [documentNames.progress(FIXTURE_PROFILE.id)]: await progressText(options.activity, options.step) }),
  };
  const launched = await launchApp({ band: options.band, seed: 7, activity: options.activity }, { documents });
  try {
    await resizeWindow(launched, options.size ?? { width: 1280, height: 800 });
    await kitTime(launched.page).pin(PINNED_AT);
    await goToActivity(launched.page, options.activity);
    if (options.step !== undefined && options.step > 0) {
      await launched.page.locator(`[data-step="${String(options.step)}"]`).click();
    }
    await expect(launched.page.locator(`[data-activity="${options.activity}"] .rp-screen`)).toBeVisible();
    await expect(launched.page.locator('html')).toHaveAttribute('data-band', options.band);
    return launched;
  } catch (error) {
    await launched.close();
    throw error;
  }
}

/** The screen's puzzle id, which changes when the kit moves to the next step. */
export function screen(page: Page) {
  return page.locator('.rp-screen');
}

/**
 * Lets a run of `program` play to its end on the pinned kit clock, one step at a time, so the
 * page renders each step and the robot's glide runs on the frames that follow.
 */
export async function playRun(page: Page, program: ValidProgram, world: World, band: Band): Promise<void> {
  const steps = runProgram(program, world).steps;
  const pause = stepPause(steps, band);
  for (let step = 0; step <= steps + 1; step++) await kitTime(page).advance(pause);
  await settleRobot(page);
}

/** Lets the robot finish gliding to where it was sent, on the pinned kit clock. */
export async function settleRobot(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) await kitTime(page).advance(1000);
}

/** Presses "next picture" and lets the shell move on to the next step. */
export async function nextPicture(page: Page): Promise<void> {
  await page.locator('[data-choice="next"]').click();
  await kitTime(page).advance(BETWEEN_ROUNDS_MS);
}

function keyOf(block: BlockDraft): string {
  switch (block.kind) {
    case 'move':
      return `move-${block.direction}`;
    case 'turn':
      return `turn-${block.direction}`;
    case 'color':
      return `color-${block.color}`;
    case 'call':
      return `call-${block.name}`;
    default:
      return block.kind;
  }
}

/** The placed block a toolbox block lands as, before the child changes its value. */
function startingDraft(toolbox: readonly ToolboxItem[], program: Program, wanted: BlockDraft): BlockDraft {
  const entry = paletteFor(toolbox, program).find((each) => each.key === keyOf(wanted));
  if (entry?.kind !== 'block') throw new Error(`The toolbox has no ${keyOf(wanted)}`);
  return entry.draft;
}

/** The last block of a list on screen. */
function lastBlock(page: Page, list: string) {
  return page.locator(`[data-list="${list}"] > li > .rp-block`).last();
}

/**
 * Enters blocks at the end of a list with real clicks: choose the list, click each toolbox
 * block, press plus or minus until the value matches, and fill a repeat's body. `program` is
 * the program on screen before, so the toolbox's call blocks are known.
 */
export async function enterBlocks(
  page: Page,
  toolbox: readonly ToolboxItem[],
  program: Program,
  list: string,
  blocks: readonly BlockDraft[],
): Promise<void> {
  for (const wanted of blocks) {
    const endSlot = page.locator(`[data-end-slot="${list}"]`);
    if ((await endSlot.getAttribute('data-selected')) !== 'true') await endSlot.click();
    await expect(endSlot).toHaveAttribute('data-selected', 'true');
    const before = await page.locator(`[data-list="${list}"] > li > .rp-block`).count();
    await page.locator(`[data-tool="${keyOf(wanted)}"]`).click();
    await expect(page.locator(`[data-list="${list}"] > li > .rp-block`)).toHaveCount(before + 1);
    const added = lastBlock(page, list);
    const id = await added.getAttribute('data-block-id');
    if (id === null) throw new Error('A placed block has an id');
    await stepTo(page, toolbox, id, startingDraft(toolbox, program, wanted), wanted);
    if (wanted.kind === 'repeat') await enterBlocks(page, toolbox, program, id, wanted.body);
  }
}

/** Presses plus or minus on a placed block until its value is the wanted one. */
async function stepTo(
  page: Page,
  toolbox: readonly ToolboxItem[],
  id: string,
  placed: BlockDraft,
  wanted: BlockDraft,
): Promise<void> {
  const choices = valueChoices(placed, toolbox);
  const from = blockValue(placed);
  const to = blockValue(wanted);
  if (choices === null || from === null || to === null) return;
  const moves = choices.indexOf(to) - choices.indexOf(from);
  const button = page.locator(`[data-block-id="${id}"] > .rp-block-row [data-step="${moves > 0 ? 'more' : 'fewer'}"]`);
  for (let i = 0; i < Math.abs(moves); i++) await button.click();
}

/** The one block where a fix puzzle's starting program differs from its solution. */
export function wrongBlock(
  start: Program,
  solution: Program,
): { id: string; list: string; index: number; wanted: BlockDraft } {
  const found: { id: string; list: string; index: number; wanted: BlockDraft }[] = [];
  const walk = (mine: readonly Block[], theirs: readonly Block[], list: string) => {
    mine.forEach((block, index) => {
      const other = theirs[index];
      if (other === undefined) return;
      if (block.kind === 'repeat' && other.kind === 'repeat') {
        walk(block.body, other.body, block.id);
        return;
      }
      const [a] = toDraft({ blocks: [block], definitions: [] }).blocks;
      const [b] = toDraft({ blocks: [other], definitions: [] }).blocks;
      if (b !== undefined && JSON.stringify(a) !== JSON.stringify(b))
        found.push({ id: block.id, list, index, wanted: b });
    });
  };
  walk(start.blocks, solution.blocks, 'main');
  const [only] = found;
  if (found.length !== 1 || only === undefined)
    throw new Error(`Expected one wrong block, found ${String(found.length)}`);
  return only;
}

/**
 * Every button on screen is at least the band's smallest target and inside the window. Buttons
 * in the toolbox and the program scroll with their panel, so the panel itself must fit instead.
 */
export async function expectTargetsFit(page: Page, band: Band, size: { width: number; height: number }): Promise<void> {
  const smallest = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 }[band];
  const boxes = await page.locator('.rp-screen button').evaluateAll((elements) =>
    elements.map((element) => {
      const scroller = element.closest('.rp-program-scroll, .rp-toolbox');
      const rect = element.getBoundingClientRect();
      const outer = (scroller ?? element).getBoundingClientRect();
      return {
        name: element.getAttribute('aria-label'),
        width: rect.width,
        height: rect.height,
        right: outer.right,
        bottom: outer.bottom,
      };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(Math.min(box.width, box.height), `${String(box.name)} is big enough`).toBeGreaterThanOrEqual(smallest - 0.5);
    expect(box.right, `${String(box.name)} fits across`).toBeLessThanOrEqual(size.width);
    expect(box.bottom, `${String(box.name)} fits down`).toBeLessThanOrEqual(size.height);
  }
}
