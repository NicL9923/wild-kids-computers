import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { strings as galleryStrings } from '../src/app/gallery/strings.ts';
import type { GalleryView } from '../src/app/gallery/galleryViews.ts';
import { BANDS, type Band } from '../src/core/bands.ts';
import { expectAccessible } from './support/accessibility.ts';
import { launchApp, type LaunchedApp } from './support/launchApp.ts';
import { SCREENS_DIR } from './support/screens.ts';
import { DEV_GALLERY_PATH } from '../src/app/paths.ts';

/** The smallest target per band, from src/styles/tokens.css. */
const TARGET_MIN: Record<Band, number> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
] as const;

// Playwright wipes test-results/ on every run, so review screenshots go where it does not.
const screensDir = SCREENS_DIR;

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

/** Resizes the app window's content area, the way a person resizing the window would. */
async function resizeWindow(size: { width: number; height: number }): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  await expect
    .poll(() => launched.page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([size.width, size.height]);
}

async function openGallery(page: Page, band: Band, view: GalleryView): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, `#${DEV_GALLERY_PATH}?band=${band}&view=${view}`);
  await expect(page.locator('html')).toHaveAttribute('data-band', band);
  // Fonts and pictures finish loading before anything is measured or photographed.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  });
}

/**
 * Whether the element has focus inside the page. Playwright's toBeFocused also asks the operating
 * system window for focus, which an Electron window under a virtual display without a window
 * manager never gets.
 */
async function expectFocused(locator: Locator): Promise<void> {
  await expect.poll(() => locator.evaluate((element) => element === document.activeElement)).toBe(true);
}

/** The smallest width and height among the controls a child or adult presses. */
async function smallestTarget(page: Page): Promise<{ width: number; height: number; which: string }> {
  return page.evaluate(() => {
    const selector = '.wk-button, .wk-tile, .wk-segment, .wk-switch, .wk-input, .wk-slider, .wk-home-place';
    let smallest = { width: Infinity, height: Infinity, which: '' };
    for (const element of document.querySelectorAll(selector)) {
      const box = element.getBoundingClientRect();
      if (Math.min(box.width, box.height) < Math.min(smallest.width, smallest.height)) {
        smallest = { width: box.width, height: box.height, which: element.outerHTML.slice(0, 80) };
      }
    }
    return smallest;
  });
}

for (const band of BANDS) {
  test(`gallery at ${band}: targets meet the band minimum, the page passes axe, and screens are saved`, async () => {
    const { page } = launched;

    for (const size of SIZES) {
      await resizeWindow(size);
      const label = `${size.width}x${size.height}`;

      await openGallery(page, band, 'all');
      await expect(page.getByRole('heading', { level: 1, name: galleryStrings.title.text })).toBeVisible();
      const smallest = await smallestTarget(page);
      expect(Math.min(smallest.width, smallest.height), smallest.which).toBeGreaterThanOrEqual(TARGET_MIN[band]);
      await expectAccessible(page);
      await page.screenshot({ path: path.join(screensDir, band, `gallery-${label}.png`), fullPage: true });

      await openGallery(page, band, 'map');
      const places = page.getByRole('navigation', { name: galleryStrings.meadow.text }).getByRole('button');
      await expect(places).toHaveCount(5);
      for (const place of await places.all()) await expect(place).toBeInViewport({ ratio: 1 });
      await expectAccessible(page);
      await page.screenshot({ path: path.join(screensDir, band, `home-map-${label}.png`) });

      for (const view of ['finish', 'closing'] as const) {
        await openGallery(page, band, view);
        await expectAccessible(page);
        await page.screenshot({ path: path.join(screensDir, band, `${view}-${label}.png`) });
      }
    }
  });
}

test('home map places stay at least twice the youngest band target in the smallest supported window', async () => {
  const { page } = launched;
  await resizeWindow({ width: 1024, height: 640 });
  await openGallery(page, 'band-3-5', 'map');
  const places = page.getByRole('navigation', { name: galleryStrings.meadow.text }).getByRole('button');
  for (const place of await places.all()) {
    const box = await place.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(2 * TARGET_MIN['band-3-5']);
    await expect(place).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: path.join(screensDir, 'band-3-5', 'home-map-1024x640.png') });
});

test('primitives work from the keyboard alone, and a dialog returns focus when it closes', async () => {
  const { page } = launched;
  await resizeWindow(SIZES[1]);
  await openGallery(page, 'band-6-8', 'all');

  // Switch: Space toggles it.
  const kiosk = page.getByRole('switch', { name: galleryStrings.kioskLabel.text });
  await kiosk.focus();
  await page.keyboard.press('Space');
  await expect(kiosk).toHaveAttribute('aria-checked', 'true');

  // SegmentedChoice: the arrow keys move the choice.
  const sizes = page.getByRole('group', { name: galleryStrings.textSize.text });
  await sizes.getByRole('radio', { name: galleryStrings['text-size-standard'].text, exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(sizes.getByRole('radio', { name: galleryStrings['text-size-large'].text, exact: true })).toBeChecked();

  // Slider: the arrow keys change the value.
  const volume = page.getByRole('slider', { name: galleryStrings.volume.text });
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveAttribute('aria-valuetext', '70%');

  // Dialog: Enter opens it with focus inside, Escape closes it and focus goes back.
  const opener = page.getByRole('button', { name: galleryStrings.openDialog.text });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: galleryStrings.dialogTitle.text });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expectFocused(opener);

  // AlertDialog: focus starts on the way out, so Enter keeps the profile.
  const deleteButton = page.getByRole('button', { name: galleryStrings.openAlert.text });
  await deleteButton.focus();
  await page.keyboard.press('Enter');
  const alert = page.getByRole('alertdialog', { name: galleryStrings.alertTitle.text });
  await expectFocused(page.getByRole('button', { name: galleryStrings.keep.text }));
  await page.keyboard.press('Enter');
  await expect(alert).toBeHidden();
});
