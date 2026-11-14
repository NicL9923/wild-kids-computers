import { expect, test, type Page } from '@playwright/test';
import activity from '../../src/features/computer-skills/activities/typing-course/activity.ts';
import {
  codeFor,
  fingerFor,
  LESSONS,
  SHIFT,
  shiftFingerFor,
} from '../../src/features/computer-skills/activities/typing-course/lessons.ts';
import { generateLevel } from '../../src/features/computer-skills/activities/typing-course/level.ts';
import { FINGER_NAMES } from '../../src/features/computer-skills/activities/typing-course/speech.ts';
import { strings } from '../../src/features/computer-skills/activities/typing-course/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { openSequenceStep, savedFurthestStep } from '../support/sequenceStep.ts';

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const stage = (page: Page) => page.locator('.tc-stage');

/** Presses the key for one character, with Shift held for a capital. */
async function typeChar(page: Page, char: string): Promise<void> {
  if (char === ' ') {
    await page.keyboard.press('Space');
    return;
  }
  if (char === char.toLowerCase()) {
    await page.keyboard.press(char);
    return;
  }
  await page.keyboard.down('Shift');
  await page.keyboard.press(char);
  await page.keyboard.up('Shift');
}

forEachBand(activity.bands, (band) => {
  test('types the first lesson line, moves on to the next lesson, and saves how far it got', async () => {
    launched = await openSequenceStep({ activity: activity.id, band, step: 0 });
    const { page } = launched;
    const lesson = generateLevel(1, 0, band);
    await expect(stage(page)).toHaveAttribute('data-lesson', lesson.id);
    await expectInstructionSpoken(page, strings.newKeys);
    // The next key is lit, and its finger is marked on the hands.
    await expect(page.locator(`[data-key="${codeFor('f')}"]`)).toHaveAttribute('data-mark', 'target');
    await expect(page.locator('.tc-finger[data-finger="left-pointer"]')).toHaveAttribute('data-active', 'true');
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Focus is on the replay control after the click; the line takes the keys back.
    await page.locator('.tc-line').focus();
    for (const [index, char] of Array.from(lesson.line).entries()) {
      await typeChar(page, char);
      await expect(stage(page)).toHaveAttribute('data-typed', String(index + 1));
    }
    await expect(stage(page)).toHaveAttribute('data-done', 'true');
    await expect(stage(page)).toHaveAttribute('data-lesson', LESSONS[1]?.id ?? '');
    await expect.poll(async () => (launched ? savedFurthestStep(launched, activity.id) : undefined)).toBe(1);
  });

  test('a key that is not next types nothing; after two, the finger is named', async () => {
    // A pinned kit clock holds the pressed key's light on until the test has looked at it.
    launched = await openSequenceStep({ activity: activity.id, band, step: 0, pinClockAt: Date.UTC(2026, 10, 14, 10) });
    const { page } = launched;
    const lesson = generateLevel(1, 0, band);
    const want = lesson.line.charAt(0);
    await expect(stage(page)).toHaveAttribute('data-lesson', lesson.id);
    await page.keyboard.press('q');
    await expect(stage(page)).toHaveAttribute('data-typed', '0');
    // The key that was pressed lights on the keyboard picture, so the child sees where it is.
    await expect(page.locator('[data-key="KeyQ"]')).toHaveAttribute('data-mark', 'pressed');
    await expect(page.locator('.tc-line')).toHaveAttribute('data-waiting', 'true');
    await page.keyboard.press('q');
    await expect.poll(async () => spokenIds(page)).toContain(FINGER_NAMES[fingerFor(want)].id);
    await typeChar(page, want);
    await expect(stage(page)).toHaveAttribute('data-typed', '1');
  });

  test('the Shift lesson marks the little finger of the other hand for a capital', async () => {
    const step = LESSONS.findIndex((lesson) => lesson.newKeys.includes(SHIFT));
    launched = await openSequenceStep({ activity: activity.id, band, step });
    const { page } = launched;
    const lesson = generateLevel(1, step, band);
    const capital = lesson.line.charAt(0);
    await expect(stage(page)).toHaveAttribute('data-lesson', lesson.id);
    const shift = shiftFingerFor(capital);
    await expect(page.locator(`.tc-finger[data-finger="${shift ?? ''}"]`)).toHaveAttribute('data-active', 'true');
    await expect(page.locator(`[data-key="${shift === 'left-little' ? 'ShiftLeft' : 'ShiftRight'}"]`)).toHaveAttribute(
      'data-mark',
      'target',
    );
    // The small letter waits and says to hold Shift.
    await page.keyboard.press(capital.toLowerCase());
    await expect(stage(page)).toHaveAttribute('data-typed', '0');
    await expect.poll(async () => spokenIds(page)).toContain(strings.holdShift.id);
    await typeChar(page, capital);
    await expect(stage(page)).toHaveAttribute('data-typed', '1');
  });

  test('shows the line, the hands, and the keyboard large enough at both review sizes', async () => {
    const step = LESSONS.length - 1;
    for (const size of REVIEW_SIZES) {
      launched = await openSequenceStep({ activity: activity.id, band, step, size });
      const { page } = launched;
      const line = await page.locator('.tc-line').boundingBox();
      const hands = await page.locator('.tc-hands').boundingBox();
      const keyboard = await page.locator('.tc-keyboard').boundingBox();
      const key = await page.locator('[data-key="KeyA"]').boundingBox();
      if (line === null || hands === null || keyboard === null || key === null) throw new Error('Missing a part');
      expect(keyboard.y + keyboard.height).toBeLessThanOrEqual(size.height);
      expect(hands.height).toBeGreaterThanOrEqual(100);
      expect(key.width).toBeGreaterThanOrEqual(36);
      // The longest line stays on one row.
      expect(line.height).toBeLessThan(140);
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
