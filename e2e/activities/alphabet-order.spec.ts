import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import type { Band } from '../../src/core/bands.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/alphabet-order/activity.ts';
import {
  generateLevel,
  type AlphabetOrderLevel,
} from '../../src/features/early-learning/activities/alphabet-order/level.ts';
import { strings } from '../../src/features/early-learning/activities/alphabet-order/strings.ts';
import { letterName } from '../../src/features/early-learning/reading/alphabet.ts';
import { expectAccessible } from '../support/accessibility.ts';
import {
  expectInstructionSpoken,
  forEachBand,
  openActivity,
  saveBandScreenshot,
  spokenIds,
} from '../support/activity.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { expectTargetsFit, rangeOf, tabTo } from '../support/reading.ts';

const SEED = 4_242;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

function nextLevel(seed: number, difficulty: number, band: Band) {
  const level = generateLevel(seed, difficulty, band);
  if (level.mode !== 'next') throw new Error('Expected a next-letter round');
  return level;
}

function orderLevel(seed: number, difficulty: number, band: Band) {
  const level = generateLevel(seed, difficulty, band);
  if (level.mode !== 'order') throw new Error('Expected an ordering round');
  return level;
}

async function expectRoundShows(page: Page, level: AlphabetOrderLevel): Promise<void> {
  if (level.mode === 'next') {
    await expect(page.locator('[data-shown]')).toHaveText(level.run.map(String));
    await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(String));
  } else {
    await expect(page.locator('[data-choice]')).toHaveText(level.shuffled.map(String));
  }
}

forEachBand(activity.bands, (band) => {
  test('says the run of letters, and the letter that comes next fills the gap', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = nextLevel(roundSeed(SEED, 0), min, band);

    await expectRoundShows(page, level);
    await expectInstructionSpoken(page, strings.whatComesNext);
    for (const letter of level.run) await expect.poll(() => spokenIds(page)).toContain(letterName(letter).id);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    const wrong = level.choices.find((letter) => letter !== level.answer);
    if (wrong === undefined) throw new Error('A round always offers a wrong letter');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(page.locator('[data-gap]')).toHaveText('');

    await page.locator(`[data-choice="${level.answer}"]`).click();
    await expect(page.locator('[data-gap]')).toHaveText(level.answer);
    await saveBandScreenshot(page, band, `${activity.id}-answered`);
    await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = nextLevel(roundSeed(SEED + 1, 0), min, band);
    await expectRoundShows(page, level);
    await tabTo(page, `[data-choice="${level.answer}"]`);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-gap]')).toHaveText(level.answer);
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
        targets: ['[data-choice]'],
        ready: (page) => expectRoundShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});

test('puts letters in order one click at a time, and a letter out of turn stays put', async () => {
  const band = 'band-3-5';
  const difficulty = 4;
  launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
  const { page } = launched;
  const level = orderLevel(roundSeed(SEED, 0), difficulty, band);
  await expectRoundShows(page, level);
  await expectInstructionSpoken(page, strings.putInOrder);
  await saveBandScreenshot(page, band, activity.id, 'order');
  await expectAccessible(page);

  const [first, ...rest] = level.letters;
  const last = rest.at(-1);
  if (first === undefined || last === undefined) throw new Error('An ordering round has letters');
  // The last letter first is out of turn: it stays in the row and the boxes stay empty.
  await page.locator(`[data-choice="${last}"]`).click();
  await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
  await expect(page.locator('[data-slot="0"]')).toHaveText('');

  for (const [index, letter] of level.letters.entries()) {
    await page.locator(`[data-choice="${letter}"]`).click();
    await expect(page.locator(`[data-slot="${String(index)}"]`)).toHaveText(letter);
  }
  await expect(page.locator('[data-choice]')).toHaveCount(0);
  await saveBandScreenshot(page, band, `${activity.id}-ordered`);
  await expectRoundShows(page, generateLevel(roundSeed(SEED, 1), difficulty, band));
});
