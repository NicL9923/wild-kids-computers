import { expect, test, type Page } from '@playwright/test';
import { strings as shellStrings } from '../../src/activityShell/strings.ts';
import { nextDifficulty } from '../../src/core/activityKit/difficulty.ts';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import activity from '../../src/features/computer-skills/activities/pop-the-seed-pods/activity.ts';
import {
  BOARD,
  generateLevel,
  type PodsLevel,
} from '../../src/features/computer-skills/activities/pop-the-seed-pods/level.ts';
import { strings } from '../../src/features/computer-skills/activities/pop-the-seed-pods/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  centerOf,
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  REVIEW_SIZES,
  saveBandScreenshot,
} from '../support/activity.ts';
import { readAudioLog } from '../support/audioLog.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

const SEED = 20_261_114;
const START = 3;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const board = (page: Page) => page.locator('.pods-board');

/** Pops every pod of a level with real mouse clicks at each pod's center. */
async function popAll(page: Page, level: PodsLevel): Promise<void> {
  await expect(page.locator('[data-pod]')).toHaveCount(level.pods.length);
  for (const pod of level.pods) {
    const at = await centerOf(page, `[data-pod="${pod.id}"]`);
    await page.mouse.click(at.x, at.y);
    await expect(page.locator(`[data-pod="${pod.id}"]`)).toHaveAttribute('data-popped', 'true');
  }
}

/** The levels of a whole session of clean rounds, as the kit computes them. */
function sessionLevels(band: (typeof activity.bands)[number]): PodsLevel[] {
  const range = activity.kind === 'rounds' ? activity.difficulty[band] : undefined;
  if (range === undefined || activity.kind !== 'rounds') throw new Error('pop-the-seed-pods is a rounds activity');
  const levels: PodsLevel[] = [];
  const history: { mistakes: number; hintsUsed: number; level: number }[] = [];
  let difficulty = START;
  for (let round = 0; round < activity.roundsPerSession; round += 1) {
    levels.push(generateLevel(roundSeed(SEED, round), difficulty, band));
    history.push({ mistakes: 0, hintsUsed: 0, level: difficulty });
    difficulty = nextDifficulty(difficulty, history, range);
  }
  return levels;
}

forEachBand(activity.bands, (band) => {
  test('completes a round by clicking every pod, and the next round starts', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: START });
    const { page } = launched;
    const [first, second] = sessionLevels(band);
    if (first === undefined || second === undefined) throw new Error('A session has at least two rounds');

    await expectInstructionSpoken(page, strings.instruction);
    await expect(board(page)).toHaveAttribute('data-pods-left', String(first.pods.length));
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    await popAll(page, first);
    await saveBandScreenshot(page, band, `${activity.id}-popped`);
    const pops = (await readAudioLog(page)).filter((entry) => entry.kind === 'sfx' && entry.name === 'pop');
    expect(pops).toHaveLength(first.pods.length);
    // The next round is a fresh set of pods from the next round seed.
    await expect(board(page)).toHaveAttribute('data-pods-left', String(second.pods.length));
    await expect(page.locator('[data-pod][data-popped="false"]')).toHaveCount(second.pods.length);
  });

  test('plays a whole session to the calm finish screen, then plays again', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: START });
    const { page } = launched;
    const levels = sessionLevels(band);
    for (const [index, level] of levels.entries()) {
      await expect(board(page)).toHaveAttribute('data-pods-left', String(level.pods.length));
      // The level on screen is the one computed from the seed: the same pods in the same places.
      for (const pod of level.pods) {
        const box = await page.locator(`[data-pod="${pod.id}"]`).boundingBox();
        const area = await board(page).boundingBox();
        if (box === null || area === null) throw new Error(`round ${String(index)}: ${pod.id} is missing`);
        expect(Math.abs(box.x + box.width / 2 - (area.x + (pod.x / BOARD.width) * area.width))).toBeLessThan(2);
      }
      await popAll(page, level);
    }
    const finish = page.locator('[data-screen="finish"]');
    await expect(finish).toBeVisible();
    // Two equal choices and nothing that counts or scores.
    const choices = finish.getByRole('button', { name: /Play again|Go back to the games/ });
    await expect(choices).toHaveCount(2);
    await expect(finish).not.toContainText(/\d/);
    await expectAccessible(page);
    await saveBandScreenshot(page, band, `${activity.id}-finish`);

    await finish.getByRole('button', { name: shellStrings.playAgain.text }).click();
    await expect(board(page)).toBeVisible();
  });

  test('a click on empty ground shows a soft ring and pops nothing', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: START });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), START, band);
    const area = await board(page).boundingBox();
    if (area === null) throw new Error('The board is missing');
    // The corner by the exit control, where no pod ever sits.
    await page.mouse.click(area.x + area.width * 0.08, area.y + area.height * 0.1);
    await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-pods-left', String(level.pods.length));
    const sounds = (await readAudioLog(page)).filter((entry) => entry.kind === 'sfx').map((entry) => entry.name);
    expect(sounds).not.toContain('nudge');
  });

  test('keeps pods large and away from the exit at both review sizes', async () => {
    const level = generateLevel(roundSeed(SEED, 0), 6, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: 6, size });
      const { page } = launched;
      const exit = await page.locator('[data-control="exit"]').boundingBox();
      if (exit === null) throw new Error('The exit control is missing');
      for (const pod of level.pods) {
        const box = await page.locator(`[data-pod="${pod.id}"]`).boundingBox();
        if (box === null) throw new Error(`${pod.id} is missing`);
        // At least twice the youngest band's 72 px target, and well clear of the exit.
        expect(box.width).toBeGreaterThanOrEqual(144);
        const gapX = Math.max(box.x - (exit.x + exit.width), exit.x - (box.x + box.width), 0);
        const gapY = Math.max(box.y - (exit.y + exit.height), exit.y - (box.y + box.height), 0);
        expect(Math.hypot(gapX, gapY)).toBeGreaterThan(80);
      }
      await saveBandScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });

  test('the exit goes to the area screen, and the activity is one click from there', async () => {
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: START });
    const { page } = launched;
    await page.locator('[data-control="exit"]').click();
    const tile = page.locator(`[data-activity-tile="${activity.id}"]`);
    await expect(tile).toBeVisible();
    await expect(page.getByRole('button', { name: shellStrings.exitToMeadow.text })).toBeVisible();
    await expectAccessible(page);
    await saveBandScreenshot(page, band, `area-${activity.area}`);
    await tile.click();
    await expect(board(page)).toBeVisible();
  });
});
