import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/controls/activity.ts';
import {
  BRIGHTNESS_MIDDLE,
  generateLevel,
  type ControlTarget,
} from '../../src/features/toy-desktop/lessons/controls/level.ts';
import { targetInstruction } from '../../src/features/toy-desktop/lessons/controls/steps.ts';
import { strings } from '../../src/features/toy-desktop/lessons/controls/strings.ts';
import { BRIGHTNESS, WALLPAPERS } from '../../src/features/toy-desktop/model/apps/settingsPanel.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot } from '../support/toyDesktop.ts';

const SEED = 9_030;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const setting = (page: Page, name: string) => page.locator(`[data-setting="${name}"]`);
const cardRow = (page: Page, kind: string) => page.locator(`.ctl-row[data-target="${kind}"]`);

/** Slider presses from the top: Home, then right arrow steps of 10 to the value. */
const middleSteps = (BRIGHTNESS_MIDDLE - BRIGHTNESS.min) / BRIGHTNESS.step;

/** Sets one control with the mouse, as a child would. */
async function setWithMouse(page: Page, target: ControlTarget): Promise<void> {
  switch (target.kind) {
    case 'checkbox':
      await clickCenter(page, setting(page, 'showNames').locator('input'));
      return;
    case 'radio':
      await clickCenter(page, page.locator(`[data-wallpaper-choice="${target.value}"]`));
      return;
    case 'dropdown':
      await clickCenter(page, setting(page, 'iconSize').locator('.td-dropdown-button'));
      await clickCenter(page, page.locator(`[data-icon-size-choice="${target.value}"]`));
      return;
    case 'slider': {
      // Click on the track where the value sits.
      const slider = setting(page, 'brightness').locator('input');
      const box = await slider.boundingBox();
      if (box === null) throw new Error('No slider');
      const fraction =
        target.value === 'lowest' ? 0 : (BRIGHTNESS_MIDDLE - BRIGHTNESS.min) / (BRIGHTNESS.max - BRIGHTNESS.min);
      await page.mouse.click(box.x + 2 + fraction * (box.width - 4), box.y + box.height / 2);
      return;
    }
    case 'text':
      await clickCenter(page, page.locator('[data-text-field="computer-name"]'));
      await page.keyboard.type(target.value);
      return;
    default: {
      const row = page.locator(`[data-alert-sound="${target.value}"]`);
      while ((await row.count()) === 0) await clickCenter(page, page.locator('[data-scroll="down"]'));
      await clickCenter(page, row);
    }
  }
}

/** Sets one control with the keyboard alone. */
async function setWithKeyboard(page: Page, target: ControlTarget): Promise<void> {
  switch (target.kind) {
    case 'checkbox':
      await tabTo(page, setting(page, 'showNames').locator('input'));
      await page.keyboard.press('Space');
      return;
    case 'radio': {
      await tabTo(page, page.locator('[data-wallpaper-choice="meadow"] input'));
      const presses = WALLPAPERS.indexOf(target.value);
      for (let index = 0; index < presses; index += 1) await page.keyboard.press('ArrowRight');
      return;
    }
    case 'dropdown':
      await tabTo(page, setting(page, 'iconSize').locator('.td-dropdown-button'));
      await page.keyboard.press('Enter');
      await tabTo(page, page.locator(`[data-icon-size-choice="${target.value}"]`));
      await page.keyboard.press('Enter');
      return;
    case 'slider':
      await tabTo(page, setting(page, 'brightness').locator('input'));
      await page.keyboard.press('Home');
      if (target.value === 'middle') {
        for (let index = 0; index < middleSteps; index += 1) await page.keyboard.press('ArrowRight');
      }
      return;
    case 'text':
      await tabTo(page, page.locator('[data-text-field="computer-name"]'));
      await page.keyboard.type(target.value);
      return;
    default: {
      const row = page.locator(`[data-alert-sound="${target.value}"]`);
      await tabTo(page, page.locator('[data-scroll="down"]'));
      while ((await row.count()) === 0) await page.keyboard.press('Enter');
      await tabTo(page, row, 40, 'Shift+Tab');
      await page.keyboard.press('Enter');
    }
  }
}

/** A session seed whose first round starts with the dropdown, for the wrong pick. */
function seedStartingWithDropdown(band: Band, difficulty: number): number {
  for (let seed = SEED; seed < SEED + 400; seed += 1) {
    if (generateLevel(roundSeed(seed, 0), difficulty, band).targets[0]?.kind === 'dropdown') return seed;
  }
  throw new Error('No round starts with the dropdown');
}

forEachBand(activity.bands, (band) => {
  test('sets each control on the card with the mouse, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    const difficulty = Math.min(min + 3, rangeOf(activity, band).max);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    const [first] = level.targets;
    if (first === undefined) throw new Error('no target');
    await expect(page.locator('.ctl-row')).toHaveCount(level.targets.length);
    await expect.poll(() => spokenIds(page)).toContain(targetInstruction(first).at(-1)?.id);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    for (const [index, target] of level.targets.entries()) {
      await expect(cardRow(page, target.kind)).toHaveAttribute('aria-current', 'step');
      await setWithMouse(page, target);
      await expect(cardRow(page, target.kind)).toHaveAttribute('data-matched', 'true');
      if (index === 0) await saveReviewScreenshot(page, band, `${activity.id}-step`);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('another size from the dropdown is a gentle try, and two of them point at the dropdown', async () => {
    const difficulty = rangeOf(activity, band).min === 1 ? 2 : 3;
    const seed = seedStartingWithDropdown(band, difficulty);
    launched = await openActivity({ activity: activity.id, band, seed, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(seed, 0), difficulty, band);
    const [target] = level.targets;
    if (target?.kind !== 'dropdown') throw new Error('The round starts with the dropdown');
    const other = target.value === 'large' ? 'small' : 'large';
    // Two sizes that are not on the card, each one a gentle try.
    await setWithMouse(page, { kind: 'dropdown', value: other });
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(1);
    await clickCenter(page, setting(page, 'iconSize').locator('.td-dropdown-button'));
    await clickCenter(page, page.locator('[data-icon-size-choice="medium"]'));
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(2);
    await expect.poll(() => spokenIds(page)).toContain(strings.otherChoice.id);
    await expect(setting(page, 'iconSize')).toHaveAttribute('data-highlight', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await setWithMouse(page, target);
    await expect(cardRow(page, 'dropdown')).toHaveAttribute('data-matched', 'true');
  });

  test('can be played with the keyboard alone', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), max, band);
    for (const target of level.targets) {
      await setWithKeyboard(page, target);
      await expect(cardRow(page, target.kind)).toHaveAttribute('data-matched', 'true');
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('shows the panel and the card in full at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const desktop = await page.locator('.td-desktop').boundingBox();
      const card = await page.locator('.ctl-card').boundingBox();
      const panel = await page.locator('[data-window][data-app="settings"]').boundingBox();
      if (desktop === null || card === null || panel === null) throw new Error('Missing the card or the panel');
      expect(card.x).toBeGreaterThanOrEqual(panel.x + panel.width);
      expect(card.y + card.height).toBeLessThanOrEqual(desktop.y + desktop.height + 0.5);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
