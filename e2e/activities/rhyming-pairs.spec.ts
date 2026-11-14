import { expect, test, type Page } from '@playwright/test';
import { roundSeed } from '../../src/core/activityKit/random.ts';
import { strings as emojiNames } from '../../src/core/strings/shared/emoji.ts';
import { strings as feedback } from '../../src/core/strings/shared/feedback.ts';
import activity from '../../src/features/early-learning/activities/rhyming-pairs/activity.ts';
import {
  generateLevel,
  type Card,
  type RhymingPairsLevel,
} from '../../src/features/early-learning/activities/rhyming-pairs/level.ts';
import { strings } from '../../src/features/early-learning/activities/rhyming-pairs/strings.ts';
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

async function expectBoardShows(page: Page, level: RhymingPairsLevel): Promise<void> {
  await expect(page.locator('[data-card]')).toHaveCount(level.cards.length);
  for (const [index, card] of level.cards.entries()) {
    await expect(page.locator('[data-card]').nth(index)).toHaveAttribute('data-card', card.word);
  }
}

/** The board's pairs, each as its two cards. */
function pairsOf(level: RhymingPairsLevel): [Card, Card][] {
  const pairs: [Card, Card][] = [];
  for (const card of level.cards) {
    const partner = level.cards.find((other) => other !== card && other.rhyme === card.rhyme);
    if (partner === undefined) throw new Error(`${card.word} has no partner`);
    if (!pairs.some(([a, b]) => a === partner || b === partner)) pairs.push([card, partner]);
  }
  return pairs;
}

const card = (page: Page, word: string) => page.locator(`[data-card="${word}"]`);

forEachBand(activity.bands, (band) => {
  test('matches every rhyming pair, hears both words, and a card that does not rhyme stays unmatched', async () => {
    const { min } = rangeOf(activity, band);
    launched = await openActivity({ activity: activity.id, band, seed: SEED, difficulty: min });
    const { page } = launched;
    const level = generateLevel(roundSeed(SEED, 0), min, band);
    const pairs = pairsOf(level);

    await expectBoardShows(page, level);
    await expectInstructionSpoken(page, strings.instruction);
    await saveBandScreenshot(page, band, activity.id);
    await expectAccessible(page);

    // Pick a card, then one that does not rhyme with it: neither is matched and the first stays picked.
    const [[first, partner] = [], [other] = []] = pairs;
    if (first === undefined || partner === undefined || other === undefined)
      throw new Error('Every board has two pairs');
    await card(page, first.word).click();
    await expect(card(page, first.word)).toHaveAttribute('aria-pressed', 'true');
    await card(page, other.word).click();
    await expect.poll(() => spokenIds(page)).toContain(feedback.tryAnother.id);
    await expect(card(page, other.word)).toHaveAttribute('data-matched', 'false');
    await expect(card(page, first.word)).toHaveAttribute('aria-pressed', 'true');

    // The rhyme matches, and both names are said.
    await card(page, partner.word).click();
    await expect(card(page, first.word)).toHaveAttribute('data-matched', 'true');
    await expect(card(page, partner.word)).toHaveAttribute('data-matched', 'true');
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[partner.word].id);
    await saveBandScreenshot(page, band, `${activity.id}-matched`);

    for (const [a, b] of pairs.slice(1)) {
      await card(page, a.word).click();
      await card(page, b.word).click();
      await expect(card(page, b.word)).toHaveAttribute('data-matched', 'true');
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
    await tabTo(page, `[data-card="${a.word}"]`);
    // Focus says the picture's name, so a child who cannot read knows what it is.
    await expect.poll(() => spokenIds(page)).toContain(emojiNames[a.word].id);
    await page.keyboard.press('Enter');
    await tabTo(page, `[data-card="${b.word}"]`);
    await page.keyboard.press('Enter');
    await expect(card(page, a.word)).toHaveAttribute('data-matched', 'true');
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
