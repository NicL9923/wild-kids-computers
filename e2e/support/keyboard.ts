import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Whether the element has focus inside the page. Playwright's toBeFocused also asks the operating
 * system window for focus, which an Electron window under a virtual display without a window
 * manager never gets.
 */
async function isFocused(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element === document.activeElement);
}

export async function expectFocused(locator: Locator): Promise<void> {
  await expect.poll(() => isFocused(locator)).toBe(true);
}

/**
 * Presses Tab until `target` has focus, as a keyboard user would, and fails after `max` presses.
 * Returns how many presses it took.
 */
export async function tabTo(page: Page, target: Locator, max = 40, key: 'Tab' | 'Shift+Tab' = 'Tab'): Promise<number> {
  for (let presses = 1; presses <= max; presses++) {
    await page.keyboard.press(key);
    if (await isFocused(target)) return presses;
  }
  const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160) ?? 'nothing');
  throw new Error(`Tab never reached the target in ${String(max)} presses. Focus is on ${focused}.`);
}

/**
 * Fails unless the focused control shows the focus ring. A radio drawn as a picture or a segment
 * shows the ring on its label, so the check looks there too.
 */
export async function expectVisibleFocus(page: Page): Promise<void> {
  const ring = await page.evaluate(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return 'nothing focused';
    const shown = focused.closest('.wk-choice, .wk-segment') ?? focused;
    const style = getComputedStyle(shown);
    return style.outlineStyle !== 'none' && style.outlineWidth !== '0px' ? 'visible' : shown.outerHTML.slice(0, 120);
  });
  expect(ring).toBe('visible');
}
