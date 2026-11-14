import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/toy-desktop/lessons/secrets-stay-secret/activity.ts';
import {
  binOf,
  generateLevel,
  strengthOf,
  type SecretsLevel,
} from '../../src/features/toy-desktop/lessons/secrets-stay-secret/level.ts';
import { strings } from '../../src/features/toy-desktop/lessons/secrets-stay-secret/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { expectInstructionSpoken, forEachBand, openActivity, REVIEW_SIZES, spokenIds } from '../support/activity.ts';
import { tabTo } from '../support/keyboard.ts';
import type { LaunchedApp } from '../support/launchApp.ts';
import { rangeOf } from '../support/reading.ts';
import { clickCenter, saveReviewScreenshot, smallestTargets } from '../support/toyDesktop.ts';
import { dragBy } from '../support/toyDesktopLessons.ts';

const SEED = 1_870;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

const piece = (page: Page, id: string) => page.locator(`[data-piece="${id}"]`);
const card = (page: Page, id: string) => page.locator(`[data-fact="${id}"]`);
const bin = (page: Page, id: string) => page.locator(`[data-bin="${id}"]`);

/** The pieces to click, in the order shown, until the password is strong. */
function piecesToStrong(level: SecretsLevel): string[] {
  const chosen: string[] = [];
  let password = '';
  for (const each of level.pieces) {
    if (strengthOf(password) === 'strong') break;
    chosen.push(each.id);
    password += each.text;
  }
  return chosen;
}

async function buildStrongPassword(page: Page, level: SecretsLevel): Promise<void> {
  for (const id of piecesToStrong(level)) await clickCenter(page, piece(page, id));
  await expect(page.locator('.sss-meter')).toHaveAttribute('data-strength', 'strong');
  await expect(page.locator('.sss-stage')).toHaveAttribute('data-phase', 'sort');
}

/** Moves the pointer from the center of one element to the center of another, for a drag. */
async function offsetBetween(page: Page, from: string, to: string): Promise<{ x: number; y: number }> {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  if (a === null || b === null) throw new Error('Missing a card or a box');
  return { x: b.x + b.width / 2 - (a.x + a.width / 2), y: b.y + b.height / 2 - (a.y + a.height / 2) };
}

forEachBand(activity.bands, (band) => {
  test('click to place: builds a strong pretend password, then sorts every card, and the round ends', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    await expect(page.locator('[data-piece]')).toHaveCount(level.pieces.length);
    await expectInstructionSpoken(page, strings.instruction);
    await saveReviewScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // The meter grows as the password does: weak, then okay, then strong.
    const [first] = piecesToStrong(level);
    if (first === undefined) throw new Error('No pieces');
    await clickCenter(page, piece(page, first));
    await expect(piece(page, first)).toBeDisabled();
    await expect(page.locator('.sss-meter')).not.toHaveAttribute('data-strength', 'empty');
    await page.locator('.sss-take-off').click();
    await expect(page.locator('.sss-meter')).toHaveAttribute('data-strength', 'empty');
    await buildStrongPassword(page, level);
    await expect.poll(() => spokenIds(page)).toContain(strings.strong.id);
    await expect.poll(() => spokenIds(page)).toContain(strings.sort.id);
    await saveReviewScreenshot(page, band, `${activity.id}-sort`);
    await expectAccessible(page);

    for (const fact of level.facts) {
      await clickCenter(page, card(page, fact));
      await expect(card(page, fact)).toHaveAttribute('data-carried', 'true');
      await clickCenter(page, bin(page, binOf(fact)));
      await expect(card(page, fact)).toHaveCount(0);
    }
    await expect(bin(page, 'private').locator('li')).toHaveCount(
      level.facts.filter((f) => binOf(f) === 'private').length,
    );
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('a card dropped in the other box says why, and two tries light up its box', async () => {
    const { max } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await buildStrongPassword(page, level);
    const [fact] = level.facts;
    if (fact === undefined) throw new Error('No cards');
    const right = binOf(fact);
    const other = right === 'private' ? 'share' : 'private';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dragBy(page, card(page, fact), await offsetBetween(page, `[data-fact="${fact}"]`, `[data-bin="${other}"]`));
      await expect(page.locator('.wk-feedback-mark[data-kind="wrong"]')).toHaveCount(attempt + 1);
    }
    await expect.poll(() => spokenIds(page)).toContain((right === 'private' ? strings.isPrivate : strings.isFine).id);
    await expect(bin(page, right)).toHaveAttribute('data-hint', 'true');
    await saveReviewScreenshot(page, band, `${activity.id}-hint`);
    await dragBy(page, card(page, fact), await offsetBetween(page, `[data-fact="${fact}"]`, `[data-bin="${right}"]`));
    await expect(card(page, fact)).toHaveCount(0);
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    for (const id of piecesToStrong(level)) {
      await tabTo(page, piece(page, id));
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('.sss-stage')).toHaveAttribute('data-phase', 'sort');
    for (const fact of level.facts) {
      await tabTo(page, card(page, fact));
      await page.keyboard.press('Enter');
      const home = bin(page, binOf(fact));
      for (let presses = 0; presses < 3; presses += 1) {
        if ((await home.getAttribute('data-carry-over')) === 'true') break;
        await page.keyboard.press('ArrowRight');
      }
      await page.keyboard.press('Enter');
      await expect(card(page, fact)).toHaveCount(0);
    }
    await expect.poll(() => spokenIds(page)).toContain(feedback.youDidIt.id);
  });

  test('fits every card and both boxes at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    for (const size of REVIEW_SIZES) {
      launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: max, size });
      const { page } = launched;
      const level = generateLevel(roundSeed(SEED, 0), max, band);
      await expect(page.locator('[data-piece]')).toHaveCount(level.pieces.length);
      await saveReviewScreenshot(page, band, activity.id, `${String(size.width)}x${String(size.height)}`);
      await buildStrongPassword(page, level);
      await expect(page.locator('[data-fact]')).toHaveCount(level.facts.length);
      for (const smallest of await smallestTargets(page, '[data-fact], [data-bin]')) {
        expect(smallest).toBeGreaterThanOrEqual(band === 'band-6-8' ? 55.5 : 43.5);
      }
      for (const box of ['private', 'share']) {
        const found = await bin(page, box).boundingBox();
        expect((found?.y ?? Infinity) + (found?.height ?? 0)).toBeLessThanOrEqual(size.height);
      }
      await saveReviewScreenshot(page, band, `${activity.id}-sort`, `${String(size.width)}x${String(size.height)}`);
      await launched.close();
      launched = undefined;
    }
  });
});
