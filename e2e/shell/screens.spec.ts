import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { strings as shellStrings } from '../../src/app/shell/strings.ts';
import { BANDS, type Band } from '../../src/core/bands.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, SCREENS_DIR, settle, WINDOW_SIZES } from '../support/screens.ts';
import { gateDialog, grownUps, homeMap, openParentCorner, waitForHome } from './shellSupport.ts';

/** The smallest target per band, from src/styles/tokens.css. */
const TARGET_MIN: Record<Band, number> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/** The smallest control on screen now. */
async function smallestTarget(page: Page): Promise<{ size: number; which: string }> {
  return page.evaluate(() => {
    let smallest = { size: Infinity, which: '' };
    for (const element of document.querySelectorAll('button, input, summary')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0) continue;
      const target = element.closest('.wk-choice, .wk-segment') ?? element;
      const shown = target.getBoundingClientRect();
      const size = Math.min(shown.width, shown.height);
      if (size < smallest.size) smallest = { size, which: target.outerHTML.slice(0, 120) };
    }
    return smallest;
  });
}

async function openHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
}

for (const band of BANDS) {
  test(`shell screens at ${band}: targets meet the band minimum, axe passes, and screens are saved`, async () => {
    launched = await launchApp({ band });
    const { page } = launched;
    await waitForHome(page);

    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      await openHash(page, '#/home');
      await waitForHome(page);
      for (const place of await homeMap(page).getByRole('button').all()) {
        await expect(place).toBeInViewport({ ratio: 1 });
      }
      const smallest = await smallestTarget(page);
      expect(smallest.size, smallest.which).toBeGreaterThanOrEqual(TARGET_MIN[band]);
      await expectAccessible(page);
      await saveScreen(page, band, 'shell-home');

      await page.getByRole('button', { name: homeStrings['place-robot-painter'].text }).hover();
      await saveScreen(page, band, 'shell-home-hover');

      await grownUps(page).click();
      await expect(gateDialog(page, 'parent-corner')).toBeVisible();
      await expectAccessible(page);
      await saveScreen(page, band, 'shell-gate');
      await page.keyboard.press('Escape');
      await waitForHome(page);

      await openParentCorner(page);
      // The corner is for adults and always uses the oldest band's targets.
      const corner = await smallestTarget(page);
      expect(corner.size, corner.which).toBeGreaterThanOrEqual(TARGET_MIN['band-9-12']);
      await expectAccessible(page);
      await settle(page);
      await saveScreen(page, band, 'shell-parent-corner');
      await page.screenshot({
        path: path.join(SCREENS_DIR, band, `shell-parent-corner-full-${String(size.width)}x${String(size.height)}.png`),
        fullPage: true,
      });

      await openHash(page, '#/no-such-place');
      await expect(page.getByRole('heading', { level: 1, name: shellStrings.notFound.text })).toBeVisible();
      await expectAccessible(page);
      await saveScreen(page, band, 'shell-not-found');
    }
  });
}
