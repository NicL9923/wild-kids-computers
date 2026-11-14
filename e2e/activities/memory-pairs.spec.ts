import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import activity from '../../src/features/early-learning/activities/memory-pairs/activity.ts';
import {
  generateLevel,
  type MemoryCard,
  type MemoryPairsLevel,
} from '../../src/features/early-learning/activities/memory-pairs/level.ts';
import { strings } from '../../src/features/early-learning/activities/memory-pairs/strings.ts';
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

const card = (page: Page, id: string) => page.locator(`[data-card="${id}"]`);

async function expectBoardShows(page: Page, level: MemoryPairsLevel): Promise<void> {
  await expect(page.locator('[data-card]')).toHaveCount(level.cards.length);
  // Every card starts face down.
  await expect(page.locator('[data-card][data-up="true"]')).toHaveCount(0);
}

/** The board's pairs, each as its two cards, in board order of the first card. */
function pairsOf(level: MemoryPairsLevel): [MemoryCard, MemoryCard][] {
  const pairs: [MemoryCard, MemoryCard][] = [];
  for (const each of level.cards) {
    if (pairs.some(([a]) => a.picture === each.picture)) continue;
    const partner = level.cards.find((other) => other !== each && other.picture === each.picture);
    if (partner === undefined) throw new Error(`${each.picture} has no partner`);
    pairs.push([each, partner]);
  }
  return pairs;
}

forEachBand(activity.bands, (band) => {
  test('turns two cards that differ back over, and finding every pair ends the round', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const [[first, partner] = [], [other] = []] = pairsOf(level);
    if (first === undefined || partner === undefined || other === undefined) throw new Error('Two pairs at least');

    await expectBoardShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Turning a card shows its picture and says its name.
    await card(page, first.id).click();
    await expect(card(page, first.id)).toHaveAttribute('data-picture', first.picture);
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[first.picture].id);

    // A card that differs shows too, then both turn back by themselves.
    await card(page, other.id).click();
    await expect(card(page, other.id)).toHaveAttribute('data-picture', other.picture);
    await expect(page.locator('[data-card][data-up="true"]')).toHaveCount(0);

    // The match stays up with a check.
    await card(page, first.id).click();
    await card(page, partner.id).click();
    await expect(card(page, first.id)).toHaveAttribute('data-matched', 'true');
    await expect(card(page, partner.id)).toHaveAttribute('data-matched', 'true');
    await expect(page.locator('.wk-feedback-mark[data-kind="correct"]')).toBeVisible();
    await settle(page);
    await saveBandScreenshot(page, band, `${activity.id}-matched`);

    for (const [a, b] of pairsOf(level).slice(1)) {
      await card(page, a.id).click();
      await card(page, b.id).click();
      await expect(card(page, b.id)).toHaveAttribute('data-matched', 'true');
    }
    await expect(page.locator('[data-card][data-matched="true"]')).toHaveCount(level.cards.length);
    await expectBoardShows(page, generateLevel(roundSeed(SEED, 1), min, band));
  });

  test('can be played with the keyboard alone', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED + 1, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED + 1, 0), min, band);
    await expectBoardShows(page, level);
    const [[a, b] = []] = pairsOf(level);
    if (a === undefined || b === undefined) throw new Error('Every board has a pair');
    await tabTo(page, `[data-card="${a.id}"]`);
    await page.keyboard.press('Enter');
    await tabTo(page, `[data-card="${b.id}"]`);
    await page.keyboard.press('Enter');
    await expect(card(page, a.id)).toHaveAttribute('data-matched', 'true');
  });

  test('fits the biggest board of the band at both review sizes', async () => {
    const { max } = rangeOf(activity, band);
    const level = generateLevel(roundSeed(SEED, 0), max, band);
    await expectTargetsFit(
      {
        activity,
        band,
        seed: SEED,
        difficulty: max,
        targets: ['[data-card]'],
        ready: (page) => expectBoardShows(page, level),
      },
      (opened) => {
        launched = opened;
      },
    );
  });
});
