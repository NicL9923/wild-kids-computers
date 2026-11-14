import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import type { WindowControl } from '../../src/features/toy-desktop/desktop/parts.ts';
import type { AppKind } from '../../src/features/toy-desktop/model/state.ts';
import { saveBandScreenshot } from './activity.ts';

/**
 * Helpers for toy desktop end-to-end specs: free play and every toy desktop lesson. Find things
 * by the data attributes the desktop renders, and move the mouse for real.
 */

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * Saves a review screenshot and keeps a copy in reports/screens/<band>/, which survives the next
 * run. Playwright empties test-results/ every time it starts.
 */
export async function saveReviewScreenshot(page: Page, band: Band, name: string, variant?: string): Promise<void> {
  const file = await saveBandScreenshot(page, band, name, variant);
  const kept = path.join(projectRoot, 'reports', 'screens', band, path.basename(file));
  await mkdir(path.dirname(kept), { recursive: true });
  await copyFile(file, kept);
}

/** A desktop icon: `app:notepad`, `file:Pictures/Fox`, or `trash`. */
export function desktopIcon(page: Page, key: string): Locator {
  return page.locator(`[data-desktop-icon="${key}"]`);
}

/** The open window of an app. Pass `nth` when more than one is open. */
export function windowOf(page: Page, app: AppKind, nth = 0): Locator {
  return page.locator(`[data-window][data-app="${app}"]`).nth(nth);
}

export function windowControl(window: Locator, control: WindowControl): Locator {
  return window.locator(`[data-window-control="${control}"]`);
}

export function titleBar(window: Locator): Locator {
  return window.locator('.td-title');
}

/**
 * The center of a locator, for a real mouse click with `page.mouse`. Lesson specs use it.
 *
 * @public
 */
export async function centerOfLocator(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('The element is not on screen.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Clicks with the real mouse at the center of an element. */
export async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const at = await centerOfLocator(locator);
  await page.mouse.click(at.x, at.y);
}

/**
 * Moves a window by its title bar with a click to pick up and a click to place, the alternative
 * to a drag that every move has. Returns the window's box before and after.
 */
export async function moveWindowByClicks(
  page: Page,
  window: Locator,
  by: { x: number; y: number },
): Promise<{ before: { x: number; y: number }; after: { x: number; y: number } }> {
  const before = await window.boundingBox();
  if (before === null) throw new Error('The window is not on screen.');
  // Near the left end of the title bar, away from the window's buttons on the right.
  const grab = { x: before.x + 16, y: before.y + 12 };
  await page.mouse.click(grab.x, grab.y);
  await expect(titleBar(window)).toHaveAttribute('data-carried', 'true');
  await page.mouse.move(grab.x + by.x / 2, grab.y + by.y / 2, { steps: 4 });
  await page.mouse.move(grab.x + by.x, grab.y + by.y, { steps: 4 });
  await page.mouse.click(grab.x + by.x, grab.y + by.y);
  await expect(titleBar(window)).toHaveAttribute('data-carried', 'false');
  const after = await window.boundingBox();
  if (after === null) throw new Error('The window left the screen.');
  return { before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y } };
}

/** Every element that must meet the band's smallest target: desktop icons and window buttons. */
export async function smallestTargets(page: Page, selector: string): Promise<number[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    }),
  );
}
