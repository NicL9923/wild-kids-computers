import { expect, test, type Page } from '@playwright/test';
import { BANDS, type Band } from '../../src/core/bands.ts';
import { strings } from '../../src/features/paint-studio/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import {
  galleryIds,
  openRoute,
  openStudio,
  resizeWindow,
  saveScreen,
  screenPoint,
  WINDOW_SIZES,
} from './studioSupport.ts';
import { PAINT_GALLERY_PATH } from '../../src/features/paint-studio/paths.ts';

/** The smallest target per band, from src/styles/tokens.css. */
const TARGET_MIN: Record<Band, number> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/** The smallest control a child can press on screen now. */
async function smallestTarget(page: Page): Promise<{ size: number; which: string }> {
  return page.evaluate(() => {
    let smallest = { size: Infinity, which: '' };
    for (const element of document.querySelectorAll('.wk-paint-screen button, .wk-paint-screen input')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || element.closest('[hidden]') !== null) continue;
      const size = Math.min(box.width, box.height);
      if (size < smallest.size) smallest = { size, which: element.outerHTML.slice(0, 120) };
    }
    return smallest;
  });
}

async function check(page: Page, band: Band, name: string): Promise<void> {
  const smallest = await smallestTarget(page);
  expect(smallest.size, smallest.which).toBeGreaterThanOrEqual(TARGET_MIN[band]);
  await expectAccessible(page);
  await saveScreen(page, band, name);
}

async function openPanel(page: Page, opener: string, dialog: string): Promise<void> {
  await page.getByRole('button', { name: opener, exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
  // Previews paint on the next frame.
  await page.waitForTimeout(150);
}

async function tool(page: Page, name: string): Promise<void> {
  await page.getByRole('toolbar', { name: strings.tools.text }).getByRole('button', { name, exact: true }).click();
}

for (const band of BANDS) {
  test(`studio and gallery at ${band}: every view passes axe, meets the target size, and is saved for review`, async () => {
    test.setTimeout(120_000);
    launched = await launchApp({ band });
    const { page } = launched;
    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      await openStudio(page);

      // A few strokes, so the screens show a picture in progress.
      for (const [x, y] of [
        [300, 300],
        [700, 600],
        [1200, 350],
      ] as const) {
        const from = await screenPoint(page, x, y);
        const to = await screenPoint(page, x + 250, y + 120);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 10 });
        await page.mouse.up();
      }
      await check(page, band, 'studio');

      await tool(page, strings['tool-stamp'].text);
      await expect(page.getByRole('dialog', { name: strings.chooseStamp.text })).toBeVisible();
      await check(page, band, 'stamp-picker');
      await page.keyboard.press('Escape');
      await check(page, band, 'stamp-options');

      await tool(page, strings['tool-effects'].text);
      await expect(page.getByRole('dialog', { name: strings.chooseEffect.text })).toBeVisible();
      await page.waitForTimeout(150);
      await check(page, band, 'effect-picker');
      await page.keyboard.press('Escape');

      await openPanel(page, strings.coloringPages.text, strings.coloringPages.text);
      await check(page, band, 'page-picker');
      await page.keyboard.press('Escape');

      if (band !== 'band-3-5') {
        await tool(page, strings['tool-brush'].text);
        await openPanel(page, strings.tips.text, strings.chooseTip.text);
        await check(page, band, 'tip-picker');
        await page.keyboard.press('Escape');

        await tool(page, strings['tool-shapes'].text);
        await check(page, band, 'shape-options');
        await tool(page, strings['tool-fill'].text);
        await check(page, band, 'fill-options');

        await tool(page, strings['tool-text'].text);
        const at = await screenPoint(page, 400, 800);
        await page.mouse.click(at.x, at.y);
        await page.getByRole('textbox', { name: strings.textEntry.text }).fill('Hello meadow');
        await check(page, band, 'letters');
        await page.getByRole('button', { name: strings.placeText.text }).click();

        await page.getByRole('button', { name: strings.mixColor.text }).click();
        await check(page, band, 'mix-color');
        await page.keyboard.press('Escape');
      }

      await tool(page, strings['tool-brush'].text);
      await expect.poll(() => galleryIds(page), { timeout: 10_000 }).not.toHaveLength(0);
      await openRoute(page, `#${PAINT_GALLERY_PATH}`);
      await check(page, band, 'gallery');
    }
  });
}
