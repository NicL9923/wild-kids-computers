import { expect, test, type Page } from '@playwright/test';
import activity from '../../src/features/computer-skills/activities/shortcut-workshop/activity.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/shortcut-workshop/level.ts';
import {
  STEPS,
  tidyLines,
  type StepId,
} from '../../src/features/computer-skills/activities/shortcut-workshop/steps.ts';
import { strings } from '../../src/features/computer-skills/activities/shortcut-workshop/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, REVIEW_SIZES, saveBandScreenshot } from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { openSequenceStep, savedFurthestStep } from '../support/sequenceStep.ts';

const mac = process.platform === 'darwin';
const primary = mac ? 'Meta' : 'Control';
const modifier = mac ? 'meta' : 'control';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const stage = (page: Page) => page.locator('.sw-stage');
const note = (page: Page) => page.getByRole('textbox', { name: strings.note.text });

interface Press {
  readonly keyCode: string;
  readonly modifiers: readonly ('control' | 'meta' | 'shift')[];
}

const shortcut = (keyCode: string): Press => ({ keyCode, modifiers: [modifier] });
const TO_END: Press = mac ? { keyCode: 'Down', modifiers: ['meta'] } : { keyCode: 'End', modifiers: ['control'] };
const TO_START: Press = mac ? { keyCode: 'Up', modifiers: ['meta'] } : { keyCode: 'Home', modifiers: ['control'] };
const SELECT_TO_LINE_END: Press = mac
  ? { keyCode: 'Right', modifiers: ['meta', 'shift'] }
  : { keyCode: 'End', modifiers: ['shift'] };

/** The keys a child presses for each step: the shortcuts it teaches, and a move where needed. */
const PRESSES: Readonly<Record<StepId, readonly Press[]>> = {
  'select-all': [shortcut('A')],
  copy: [shortcut('C')],
  paste: [shortcut('V')],
  cut: [shortcut('X')],
  undo: [shortcut('Z')],
  save: [shortcut('S')],
  'copy-and-paste': [shortcut('C'), TO_END, shortcut('V')],
  'cut-and-paste': [shortcut('X'), TO_START, shortcut('V')],
  'undo-twice': [shortcut('Z'), shortcut('Z')],
  'all-together': [SELECT_TO_LINE_END, shortcut('C'), TO_END, shortcut('V'), shortcut('S')],
};

/** What the note says when each step is done, line by line. */
const DONE_LINES: Readonly<Partial<Record<StepId, readonly string[]>>> = {
  paste: ['Flowers to plant:', 'sunflower', 'daisy', 'tulip'],
  cut: ['Garden list', 'seeds', 'gloves'],
  undo: ['Bring a hat and a snack.'],
  'copy-and-paste': ['Row 1: beans', 'Row 2: beans'],
  'cut-and-paste': ['1. Dig a hole.', '2. Water them.'],
  'undo-twice': ['Pack the big red blanket.'],
  'all-together': ['Seed packets', 'keep them dry', 'Seed packets'],
};

/**
 * Sends key presses through webContents.sendInputEvent, the native path a real keyboard takes,
 * which also reaches the application menu's edit shortcuts. Playwright's keyboard skips that path.
 */
async function pressNative(app: LaunchedApp, presses: readonly Press[]): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, keys) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined) throw new Error('No window.');
    contents.focus();
    for (const { keyCode, modifiers } of keys) {
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [...modifiers] });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [...modifiers] });
    }
  }, presses);
}

const systemClipboard = (app: LaunchedApp) => app.app.evaluate(({ clipboard }) => clipboard.readText());

forEachBand(activity.bands, (band) => {
  test('selects all with the shortcut, moves on to the next step, and saves how far it got', async () => {
    launched = await openSequenceStep({ activity: activity.id, band, step: 0 });
    const { page } = launched;
    const step = generateLevel(1, 0, band);
    await expect(stage(page)).toHaveAttribute('data-step', step.id);
    await expectInstructionSpoken(page, strings.stepSelectAll);
    // The shortcut shows the modifier of this computer.
    await expect(page.locator('.sw-cap[data-cap="modifier"]')).toHaveText(
      mac ? strings.capCmd.text : strings.capCtrl.text,
    );
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Focus is on the replay control after the click. The shortcut still reaches the note.
    await page.keyboard.press(`${primary}+A`);
    await expect(stage(page)).toHaveAttribute('data-done', 'true');
    expect(
      await note(page).evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd]),
    ).toEqual([0, step.text.length]);
    await expect(stage(page)).toHaveAttribute('data-step', STEPS[1]?.id ?? '');
    await expect.poll(async () => (launched ? savedFurthestStep(launched, activity.id) : undefined)).toBe(1);
  });

  test('every step finishes with real shortcuts, and the system clipboard never changes', async () => {
    test.setTimeout(120_000);
    for (const [index, step] of STEPS.entries()) {
      launched = await openSequenceStep({ activity: activity.id, band, step: index });
      const { page } = launched;
      await launched.app.evaluate(({ clipboard }) => clipboard.writeText('adult password'));
      await expect(stage(page)).toHaveAttribute('data-step', step.id);
      await expect(note(page)).toHaveValue(step.text);
      await pressNative(launched, PRESSES[step.id]);
      await expect(stage(page), step.id).toHaveAttribute('data-done', 'true');
      const lines = DONE_LINES[step.id];
      // A shortcut that ran twice, such as a paste, would leave extra text here.
      if (lines !== undefined) expect(tidyLines(await note(page).inputValue()), step.id).toEqual(lines);
      if (step.id === 'save' || step.id === 'all-together') {
        await expect(page.locator('.sw-status'), step.id).toHaveAttribute('data-saved', 'true');
      }
      expect(await systemClipboard(launched), step.id).toBe('adult password');
      await launched.close();
      launched = undefined;
    }
  });

  test('start over puts the step back as it began', async () => {
    const index = STEPS.findIndex((step) => step.id === 'paste');
    launched = await openSequenceStep({ activity: activity.id, band, step: index });
    const { page } = launched;
    const step = generateLevel(1, index, band);
    await expect(note(page)).toHaveValue(step.text);
    await page.keyboard.press(`${primary}+Home`);
    await page.keyboard.press(`${primary}+V`);
    await expect(note(page)).toHaveValue(`tulip${step.text}`);
    await expect(stage(page)).toHaveAttribute('data-done', 'false');
    await page.getByRole('button', { name: strings.startOver.text }).click();
    await expect(note(page)).toHaveValue(step.text);
    // The clipboard is as the step began too, so the paste works from the right place.
    await page.keyboard.press(`${primary}+V`);
    await expect(stage(page)).toHaveAttribute('data-done', 'true');
  });

  test('shows the note and the shortcuts large enough at both review sizes', async () => {
    const index = STEPS.length - 1;
    for (const size of REVIEW_SIZES) {
      launched = await openSequenceStep({ activity: activity.id, band, step: index, size });
      const { page } = launched;
      const window = await page.locator('.sw-window').boundingBox();
      const cap = await page.locator('.sw-cap').first().boundingBox();
      const startOver = await page.getByRole('button', { name: strings.startOver.text }).boundingBox();
      if (window === null || cap === null || startOver === null) throw new Error('Missing a part');
      expect(window.width).toBeGreaterThanOrEqual(500);
      expect(cap.height).toBeGreaterThanOrEqual(44);
      expect(startOver.y + startOver.height).toBeLessThanOrEqual(size.height);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
