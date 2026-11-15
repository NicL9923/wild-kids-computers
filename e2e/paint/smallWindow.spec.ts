import { expect, test, type Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { openStudio, resizeWindow, saveScreen } from './studioSupport.ts';

/**
 * A tiling compositor gives the window whatever tile it has, which can be smaller than the
 * 1024 by 640 the app lays out for. The page then zooms out to fit (electron/main/windowFit.ts),
 * so a small tile shows the same screen smaller instead of cutting tools off. The paint studio
 * for the oldest band has the most controls, so it is the screen that clipped first.
 */

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/** Accessible names of the buttons wholly inside the window and not hidden by a scrolling parent. */
async function fullyVisibleButtons(page: Page): Promise<string[]> {
  const names: string[] = [];
  for (const button of await page.getByRole('button').all()) {
    const name = (await button.getAttribute('aria-label')) ?? (await button.innerText());
    const inView = await expect(button)
      .toBeInViewport({ ratio: 1, timeout: 200 })
      .then(() => true)
      .catch(() => false);
    if (inView) names.push(name);
  }
  return names.toSorted();
}

async function setTile(page: Page, size: { width: number; height: number }): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  const zoom = Math.min(1, size.width / 1024, size.height / 640);
  // The layout keeps the window's shape at the zoomed scale, and is never below 1024 by 640.
  // Chromium rounds the zoomed viewport to whole pixels.
  const expected = [size.width / zoom, size.height / zoom];
  await expect
    .poll(async () => {
      const actual = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
      return actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= 1);
    })
    .toBe(true);
}

test('a tile smaller than the layout shows every studio control the smallest window shows', async () => {
  launched = await launchApp({ band: 'band-9-12' });
  const { page } = launched;
  await resizeWindow(launched, { width: 1024, height: 640 });
  await openStudio(page);
  const atMinimum = await fullyVisibleButtons(page);
  expect(atMinimum.length).toBeGreaterThan(10);

  for (const tile of [
    { width: 960, height: 1040 },
    { width: 1900, height: 520 },
    { width: 640, height: 480 },
  ]) {
    await setTile(page, tile);
    // The controls the smallest supported window shows in full are all still in full view.
    expect(await fullyVisibleButtons(page)).toEqual(expect.arrayContaining(atMinimum));
    await saveScreen(page, 'band-9-12', `tile-${tile.width}x${tile.height}`);
  }
});
