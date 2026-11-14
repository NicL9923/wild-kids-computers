import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/sliders-and-dials/activity.ts';
import { generateLevel, type Control } from '../../src/features/computer-skills/activities/sliders-and-dials/level.ts';
import { strings } from '../../src/features/computer-skills/activities/sliders-and-dials/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import { expectFocused, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const row = (page: Page, control: Control) => page.locator(`[data-control="${control.id}"]`);
const knobOf = (page: Page, control: Control) =>
  row(page, control).locator(control.kind === 'slider' ? '.dials-knob' : '.dials-dial-button');

/** The screen point on a control's track for `value`: along its width, at its middle. */
async function pointFor(page: Page, control: Control, value: number): Promise<{ x: number; y: number }> {
  const track = await row(page, control)
    .locator(control.kind === 'slider' ? '.dials-track' : '.dials-face')
    .boundingBox();
  if (track === null) throw new Error(`${control.id} has no track`);
  return { x: track.x + (value / (control.stops - 1)) * track.width, y: track.y + track.height / 2 };
}

/**
 * The center of a knob once it has stopped moving. A knob glides to its new stop, so a box read
 * right after a put-down can be partway there, and a click on it would miss.
 */
async function centerOf(page: Page, control: Control) {
  const knob = knobOf(page, control);
  const read = async () => {
    const box = await knob.boundingBox();
    if (box === null) throw new Error(`${control.id} has no knob`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  let before = await read();
  await expect
    .poll(async () => {
      const now = await read();
      const still = Math.abs(now.x - before.x) < 0.5 && Math.abs(now.y - before.y) < 0.5;
      before = now;
      return still;
    })
    .toBe(true);
  return before;
}

forEachBand(activity.bands, (band) => {
  test('click to place: picks up the slider knob and puts it down at the flag', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const [slider] = generateLevel(roundSeed(SEED, 0), 1, band).controls;
    if (slider === undefined) throw new Error('Difficulty 1 has a slider');
    await expect(row(page, slider)).toHaveAttribute('data-value', String(slider.start));
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const knob = await centerOf(page, slider);
    await page.mouse.click(knob.x, knob.y);
    await expect(knobOf(page, slider)).toHaveAttribute('data-carried', 'true');
    const flag = await pointFor(page, slider, slider.target);
    await page.mouse.move(flag.x, flag.y, { steps: 6 });
    await page.mouse.click(flag.x, flag.y);
    await expect(row(page, slider)).toHaveAttribute('data-value', String(slider.target));
    await expect(row(page, slider)).toHaveAttribute('data-matched', 'true');
    await expect(row(page, slider).locator('.dials-check')).toBeVisible();
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
  });

  test('turns a dial to its flag by dragging across it', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 3 });
    const { page } = launched;
    const [dial] = generateLevel(roundSeed(SEED, 0), 3, band).controls;
    if (dial?.kind !== 'dial') throw new Error('Difficulty 3 has one dial');
    const from = await pointFor(page, dial, dial.start);
    const to = await pointFor(page, dial, dial.target);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await expect(row(page, dial)).toHaveAttribute('data-value', String(dial.target));
    await expect(row(page, dial)).toHaveAttribute('data-matched', 'true');
    await saveBandScreenshot(page, band, activity.id, 'dial');
  });

  test('works with the keyboard alone: pick up with Enter, move with arrows, and plain arrows too', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 4 });
    const { page } = launched;
    const [slider, dial] = generateLevel(roundSeed(SEED, 0), 4, band).controls;
    if (slider === undefined || dial === undefined) throw new Error('Difficulty 4 has a slider and a dial');

    await tabTo(page, knobOf(page, slider));
    await page.keyboard.press('Enter');
    await expect(knobOf(page, slider)).toHaveAttribute('data-carried', 'true');
    const sliderKey = slider.target > slider.start ? 'ArrowRight' : 'ArrowLeft';
    for (let step = 0; step < Math.abs(slider.target - slider.start); step += 1) await page.keyboard.press(sliderKey);
    await page.keyboard.press('Enter');
    await expect(row(page, slider)).toHaveAttribute('data-matched', 'true');

    // The dial moves with plain arrow keys while it has focus, without picking it up.
    await tabTo(page, knobOf(page, dial));
    await expectFocused(knobOf(page, dial));
    const dialKey = dial.target > dial.start ? 'ArrowUp' : 'ArrowDown';
    for (let step = 0; step < Math.abs(dial.target - dial.start); step += 1) await page.keyboard.press(dialKey);
    await expect(row(page, dial)).toHaveAttribute('data-matched', 'true');
    await expect(page.locator('.wk-activity-stage')).toHaveAttribute('data-resting', 'true');
  });

  test('a knob put down away from its flag gets a quiet ring, and after two the spot is shown', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 1 });
    const { page } = launched;
    const [slider] = generateLevel(roundSeed(SEED, 0), 1, band).controls;
    if (slider === undefined) throw new Error('Difficulty 1 has a slider');
    // One stop short of the flag, then back where it started: both miss it.
    const near = slider.target + (slider.start > slider.target ? 1 : -1);
    for (const value of [near, slider.start]) {
      const knob = await centerOf(page, slider);
      await page.mouse.click(knob.x, knob.y);
      const spot = await pointFor(page, slider, value);
      await page.mouse.move(spot.x, spot.y, { steps: 4 });
      await page.mouse.click(spot.x, spot.y);
      await expect(row(page, slider)).toHaveAttribute('data-value', String(value));
      await expect(knobOf(page, slider)).toHaveAttribute('data-carried', 'false');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]').first()).toBeVisible();
    await expect(row(page, slider)).toHaveAttribute('data-helped', 'true');
    await expect(row(page, slider).locator('.dials-ghost')).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(strings.lookForFlag.id);
    await expect(row(page, slider)).toHaveAttribute('data-matched', 'false');
  });

  test('fits the busiest round with large knobs at both review sizes', async () => {
    const { controls } = generateLevel(roundSeed(SEED, 0), 7, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 7, size });
      const { page } = launched;
      for (const control of controls) {
        const box = await knobOf(page, control).boundingBox();
        if (box === null) throw new Error(`${control.id} is missing`);
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(56);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
