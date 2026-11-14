import path from 'node:path';
import type { Page } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import type { LaunchedApp } from './launchApp.ts';
import { expect } from '@playwright/test';

/**
 * Screenshots for human and agent review. Playwright empties test-results/ before every run, so
 * they go to reports/screens/<band>/, which it leaves alone and git ignores. Nothing compares
 * them; look at them.
 */
export const SCREENS_DIR = path.resolve(import.meta.dirname, '..', '..', 'reports', 'screens');

/** The two window sizes every screen is reviewed at. */
export const WINDOW_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
] as const;

/** Saves `reports/screens/<band>/<name>-<width>x<height>.png` once fonts and pictures are ready. */
export async function saveScreen(page: Page, band: Band, name: string): Promise<void> {
  await settle(page);
  const size = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
  await page.screenshot({ path: path.join(SCREENS_DIR, band, `${name}-${size}.png`) });
}

/** Waits for fonts and every picture on the page to decode, so a screenshot shows the real screen. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  });
}

/** Resizes the app window's content area, the way a person resizing the window would. */
export async function resizeWindow(launched: LaunchedApp, size: { width: number; height: number }): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  await expect
    .poll(() => launched.page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([size.width, size.height]);
}
