import type { Page } from '@playwright/test';

/**
 * Moves the app's session clock forward, so a session length runs out without waiting. The app
 * exposes the clock only under test (src/app/testClock.ts).
 */
export async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((step) => {
    if (window.wkcTestClock === undefined) throw new Error('The app has no test clock. Is WKC_TEST=1 set?');
    window.wkcTestClock.advance(step);
  }, ms);
}
