import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/tell-the-time/activity.ts';
import {
  addMinutes,
  digital,
  generateLevel,
  type ClockTime,
  type TellTheTimeLevel,
} from '../../src/features/early-learning/activities/tell-the-time/level.ts';
import { strings } from '../../src/features/early-learning/activities/tell-the-time/strings.ts';
import { sayTime } from '../../src/features/early-learning/activities/tell-the-time/timeWords.ts';
import type { Band } from '../../src/core/bands.ts';
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
/** A set round in each band's range: half hours for the younger band, quarters for the older. */
const SET_DIFFICULTY: Readonly<Partial<Record<Band, number>>> = { 'band-6-8': 3, 'band-9-12': 5 };

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

async function expectReadRound(page: Page, level: TellTheTimeLevel): Promise<void> {
  await expect(page.locator('.tt-stage')).toHaveAttribute('data-mode', 'read');
  await expect(page.locator('[data-choice]')).toHaveText(level.choices.map(digital));
}

/** The presses that turn the hands from one time to another: minutes first, then hours. */
function turnsBetween(from: ClockTime, to: ClockTime, step: number): string[] {
  const presses: string[] = [];
  let now = from;
  while (now.minute !== to.minute) {
    presses.push('minute-forward');
    now = addMinutes(now, step);
  }
  while (now.hour !== to.hour) {
    presses.push('hour-forward');
    now = addMinutes(now, 60);
  }
  return presses;
}

forEachBand(activity.bands, (band) => {
  test('reads the clock: a wrong time steps back and the right time ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    expect(level.mode).toBe('read');

    await expectReadRound(page, level);
    await expectInstructionSpoken(page, strings.whatTime);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The clock shows the round's time, not the time of day.
    const turnOf = (hand: string) =>
      page.locator(`[data-hand="${hand}"]`).evaluate((element) => getComputedStyle(element).rotate);
    expect(await turnOf('minute')).toBe(`${String(level.time.minute * 6)}deg`);
    expect(await turnOf('hour')).toBe(`${String((level.time.hour % 12) * 30 + level.time.minute / 2)}deg`);

    const answer = digital(level.time);
    const wrong = level.choices.map(digital).find((choice) => choice !== answer);
    if (wrong === undefined) throw new Error('A round always has a wrong time');
    await page.locator(`[data-choice="${wrong}"]`).click();
    await expect(page.locator(`[data-choice="${wrong}"]`)).toHaveAttribute('data-tried', 'true');
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);

    await page.locator(`[data-choice="${answer}"]`).click();
    await expect(page.locator(`[data-choice="${answer}"]`)).toHaveAttribute('data-answer', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('sets the hands to a spoken time and checks it', async () => {
    const difficulty = SET_DIFFICULTY[band] ?? 3;
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), difficulty, band);
    if (level.start === null) throw new Error('A set round has a start');
    await expect(page.locator('.tt-stage')).toHaveAttribute('data-time', digital(level.start));
    await expect(page.locator('[data-target]')).toHaveText(digital(level.time));
    // The round says the time out loud after the instruction.
    await expectInstructionSpoken(page, strings.setTo);
    const words = sayTime(level.time).map((handle) => handle.id);
    await expect.poll(() => spokenIds(page)).toEqual(expect.arrayContaining(words));
    await saveBandScreenshot(page, band, `${activity.id}-set`);
    await expectAccessible(page);

    // Checking before turning the hands gives a nudge; nothing ends.
    await page.locator('[data-control="check"]').click();
    await expect.poll(() => spokenIds(page)).toContain(feedback.lookAgain.id);

    for (const press of turnsBetween(level.start, level.time, level.step)) {
      await page.locator(`[data-turn="${press}"]`).click();
    }
    await expect(page.locator('.tt-stage')).toHaveAttribute('data-time', digital(level.time));
    await page.locator('[data-control="check"]').click();
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectReadRound(page, level);
    const answer = digital(level.time);
    await tabTo(page, `[data-choice="${answer}"]`);
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-choice="${answer}"]`)).toHaveAttribute('data-answer', 'true');
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
        ready: (page) => expectReadRound(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
