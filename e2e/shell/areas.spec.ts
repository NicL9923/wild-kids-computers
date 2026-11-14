import { expect, test } from '@playwright/test';
import { AREA_PATH } from '../../src/activityShell/paths.ts';
import { strings } from '../../src/activityShell/strings.ts';
import { AREAS } from '../../src/core/activityKit/defineActivity.ts';
import { BANDS } from '../../src/core/bands.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, settle, WINDOW_SIZES } from '../support/screens.ts';

/** Picture choices are at least twice the band's smallest target. */
const LARGE_TARGET = { 'band-3-5': 144, 'band-6-8': 112, 'band-9-12': 88 } as const;

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

for (const band of BANDS) {
  test(`area screens at ${band}: large tiles, every one reachable, Tab in reading order`, async () => {
    test.setTimeout(60_000);
    launched = await launchApp({ band });
    const { page } = launched;
    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      for (const area of AREAS) {
        await page.evaluate(
          (hash) => {
            window.location.hash = hash;
          },
          `#${AREA_PATH(area)}`,
        );
        const tiles = page.locator('[data-activity-tile]');
        await expect(tiles.first()).toBeVisible();
        await settle(page);
        if (band !== 'band-3-5') {
          // The heading names the area; the instruction line says only what to do.
          await expect(page.locator('.wk-instruction')).toHaveText(strings.pickAGame.text);
        }

        const boxes = await tiles.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return {
              id: element.getAttribute('data-activity-tile') ?? '',
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            };
          }),
        );
        for (const box of boxes) {
          expect(Math.min(box.width, box.height), `${area} ${box.id}`).toBeGreaterThanOrEqual(LARGE_TARGET[band]);
          expect(box.left, `${area} ${box.id}`).toBeGreaterThanOrEqual(0);
          expect(box.left + box.width, `${area} ${box.id}`).toBeLessThanOrEqual(size.width);
        }
        // Reading order, row by row, is the order Tab visits the tiles.
        const reading = boxes.toSorted((a, b) => Math.round(a.top - b.top) || a.left - b.left).map((box) => box.id);
        expect(
          boxes.map((box) => box.id),
          `${area} tab order`,
        ).toEqual(reading);
        // The last tile is reachable by scrolling, and nothing is clipped off the page.
        await tiles.last().scrollIntoViewIfNeeded();
        await expect(tiles.last()).toBeInViewport();
        await page.evaluate(() => window.scrollTo(0, 0));
        if (size === WINDOW_SIZES[0]) await expectAccessible(page);
        await saveScreen(page, band, `area-${area}-${String(size.width)}x${String(size.height)}`);
      }
    }
  });
}
