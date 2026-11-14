import type { Page } from '@playwright/test';

/**
 * Helpers the memory and logic activity specs share. Each spec still computes its answers from
 * its own generateLevel.
 */

/**
 * Waits until every finite animation on the page has finished, so a review screenshot shows
 * where things land rather than a frame in between. Looping animations, such as a hint's glow,
 * are left running.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}
