import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/picture-sudoku/activity.ts';
import {
  generateLevel,
  peersOf,
  type SudokuLevel,
} from '../../src/features/early-learning/activities/picture-sudoku/level.ts';
import { strings } from '../../src/features/early-learning/activities/picture-sudoku/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { settle } from '../support/logic.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const key = (r: number, c: number) => `${String(r)},${String(c)}`;
const square = (page: Page, r: number, c: number) => page.locator(`[data-cell="${key(r, c)}"]`);

function answerAt(level: SudokuLevel, r: number, c: number): SudokuLevel['pictures'][number] {
  const picture = level.pictures[level.solution[r]?.[c] ?? -1];
  if (picture === undefined) throw new Error(`No picture at ${key(r, c)}`);
  return picture;
}

async function expectRoundShows(page: Page, level: SudokuLevel): Promise<void> {
  await expect(page.locator('[data-cell]')).toHaveCount(level.size * level.size);
  await expect(page.locator('[data-cell][data-filled="false"]')).toHaveCount(level.blanks.length);
  await expect(page.locator('[data-animal]')).toHaveCount(level.size);
}

forEachBand(activity.bands, (band) => {
  test('marks the square that already holds a wrong animal, and filling every square ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, level.boxes ? strings.boxes : strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The first empty square starts picked. An animal its row or column already holds stays out,
    // and the square that holds it is marked.
    const [first] = level.blanks;
    if (first === undefined) throw new Error('A puzzle has an empty square');
    const [r, c] = first;
    await expect(square(page, r, c)).toHaveAttribute('data-active', 'true');
    const clash = peersOf(level.size, level.boxes, r, c).find(
      ([pr, pc]) => !level.blanks.some(([br, bc]) => br === pr && bc === pc),
    );
    if (clash === undefined) throw new Error('An empty square always sees a picture');
    const wrong = answerAt(level, clash[0], clash[1]);
    await page.locator(`[data-animal="${wrong}"]`).click();
    await expect(square(page, clash[0], clash[1])).toHaveAttribute('data-conflict', 'true');
    await expect(square(page, r, c)).toHaveAttribute('data-filled', 'false');
    await expect.poll(() => spokenIds(page)).toContain(feedback.lookAgain.id);
    await saveBandScreenshot(page, band, `${activity.id}-look-again`);

    for (const [br, bc] of level.blanks) {
      await square(page, br, bc).click();
      await expect(square(page, br, bc)).toHaveAttribute('data-active', 'true');
      await page.locator(`[data-animal="${answerAt(level, br, bc)}"]`).click();
      await expect(square(page, br, bc)).toHaveAttribute('data-filled', 'true');
    }
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]').last()).toBeVisible();
    await expect.poll(() => spokenIds(page)).toContain(feedback.allDone.id);
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-done`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    const last = level.blanks.at(-1);
    if (last === undefined) throw new Error('A puzzle has an empty square');
    // Enter picks the square, and Enter on an animal fills it.
    await tabTo(page, `[data-cell="${key(last[0], last[1])}"]`);
    await page.keyboard.press('Enter');
    await expect(square(page, last[0], last[1])).toHaveAttribute('data-active', 'true');
    const answer = answerAt(level, last[0], last[1]);
    await tabTo(page, `[data-animal="${answer}"]`);
    // Focus says the animal's name, so a child who cannot read knows which it is.
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[answer].id);
    await page.keyboard.press('Enter');
    await expect(square(page, last[0], last[1])).toHaveAttribute('data-filled', 'true');
  });

  test('fits the hardest round of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-cell][data-filled="false"]', '[data-animal]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
