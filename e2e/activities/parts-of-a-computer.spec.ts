import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/parts-of-a-computer/activity.ts';
import { generateLevel } from '../../src/features/toy-desktop/lessons/parts-of-a-computer/level.ts';
import { PART_NAMES, promptFor } from '../../src/features/toy-desktop/lessons/parts-of-a-computer/prompts.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { expectFocused, tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot, smallestTargets } from '../support/toyDesktop.ts';

const SEED = 4_480;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const TARGET_MIN = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 } as const;
const part = (page: Page, id: string) => page.locator(`[data-part="${id}"]`);

forEachBand(activity.bands, (band) => {
  test('clicks the part it hears, hears its name, and the next round starts', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expect(page.locator('[data-part]')).toHaveCount(level.parts.length);
    await expectInstructionSpoken(page, promptFor(level));
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await clickCenter(page, part(page, level.target));
    await expect(part(page, level.target)).toHaveAttribute('data-found', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.youFoundIt.id);
    const next = generateLevel(roundSeed(SEED, 1), min, band);
    await expect.poll(() => spokenIds(page)).toContain(promptFor(next).id);
  });

  test('a wrong part says its own name, and two of them light up the right one', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectInstructionSpoken(page, promptFor(level));
    await saveReviewScreenshot(page, band, `${activity.id}-hardest`);
    const others = level.parts.filter((each) => each !== level.target).slice(0, 2);
    for (const [index, other] of others.entries()) {
      await clickCenter(page, part(page, other));
      await expect.poll(() => spokenIds(page)).toContain(PART_NAMES[other].id);
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(index + 1);
    }
    await expect(part(page, level.target)).toHaveAttribute('data-hint', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await clickCenter(page, part(page, level.target));
    await expect(part(page, level.target)).toHaveAttribute('data-found', 'true');
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 2, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 2, 0), min, band);
    await tabTo(page, part(page, level.target));
    await expectFocused(part(page, level.target));
    await page.keyboard.press('Enter');
    await expect(part(page, level.target)).toHaveAttribute('data-found', 'true');
  });

  test('every part is big enough and in view at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      for (const smallest of await smallestTargets(page, '[data-part]')) {
        expect(smallest).toBeGreaterThanOrEqual(TARGET_MIN[band] - 0.5);
      }
      const scene = await page.locator('.poc-scene').boundingBox();
      if (scene === null) throw new Error('No scene');
      expect(scene.y + scene.height).toBeLessThanOrEqual(size.height);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
