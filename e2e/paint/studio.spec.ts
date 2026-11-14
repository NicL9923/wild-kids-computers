import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Band } from '../../src/core/bands.ts';
import { strings as colorNames } from '../../src/core/strings/shared/colors.ts';
import { strings as effectNames } from '../../src/features/paint-studio/effects/strings.ts';
import { strings } from '../../src/features/paint-studio/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { FIXTURE_PROFILE, launchApp, restartApp, type LaunchedApp } from '../support/launchApp.ts';
import { advanceClock } from '../support/clock.ts';
import { savedProfiles } from '../shell/shellSupport.ts';
import { strings as closingStrings } from '../../src/app/closing/strings.ts';
import { SESSION_CHECK_MS } from '../../src/features/paint-studio/studio/timing.ts';
import {
  canvasFingerprint,
  coloringPagePoints,
  frames,
  galleryIds,
  openRoute,
  openStudio,
  paintedPixels,
  pixelAt,
  resizeWindow,
  saveScreen,
  screenPoint,
} from './studioSupport.ts';
import { PAINT_GALLERY_PATH } from '../../src/features/paint-studio/paths.ts';

const RED = [220, 38, 38, 255];
const WHITE = [255, 255, 255, 255];

let launched: LaunchedApp;

async function start(band: Band): Promise<Page> {
  launched = await launchApp({ band });
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openStudio(launched.page);
  return launched.page;
}

test.afterEach(async () => {
  await launched.close();
});

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function chooseTool(page: Page, name: string): Promise<void> {
  await page.getByRole('toolbar', { name: strings.tools.text }).getByRole('button', { name, exact: true }).click();
}

/** Moves the real mouse to a document point, in steps, so the canvas sees every move. */
async function mouseTo(page: Page, x: number, y: number, steps = 8): Promise<void> {
  const at = await screenPoint(page, x, y);
  await page.mouse.move(at.x, at.y, { steps });
}

test('a brush stroke with press, drag, and release paints the canvas', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 400, 500, 1);
  await page.mouse.down();
  await mouseTo(page, 800, 500);
  await page.mouse.up();
  await frames(page);
  expect(await pixelAt(page, 600, 500)).toEqual(RED);
  expect(await paintedPixels(page, { x: 380, y: 300, width: 440, height: 400 })).toBeGreaterThan(5000);
  expect(await pixelAt(page, 600, 200)).toEqual(WHITE);
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'brush-stroke');
});

test('the sticky pen draws with a click, a move, and a second click, then stops', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 400, 300, 1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', 'down');
  await mouseTo(page, 1000, 300);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', 'up');
  // Moving after the second click paints nothing.
  await mouseTo(page, 1000, 800);
  await frames(page);
  expect(await pixelAt(page, 700, 300)).toEqual(RED);
  expect(await pixelAt(page, 1000, 600)).toEqual(WHITE);
  await expectAccessible(page);
});

test('the pen lifts by itself when the pointer leaves the picture', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 400, 300, 1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', 'down');
  await page.mouse.move(5, 5, { steps: 4 });
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', 'up', { timeout: 3000 });
});

test('when the session length is used up, the studio waits for the pen to lift, then closes calmly', async () => {
  launched = await launchApp(
    { band: 'band-3-5' },
    {
      documents: savedProfiles([{ ...FIXTURE_PROFILE, band: 'band-3-5' }], FIXTURE_PROFILE.id, {
        sessionLengthMinutes: 15,
      }),
    },
  );
  const { page } = launched;
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openStudio(page);
  await mouseTo(page, 400, 300, 1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', 'down');

  await advanceClock(page, 15 * 60_000);
  // A check passes with the pen down: the child finishes the line first.
  await page.waitForTimeout(SESSION_CHECK_MS + 500);
  await expect(page.locator('.wk-paint-screen')).toBeVisible();
  await mouseTo(page, 900, 300);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole('heading', { level: 1, name: closingStrings.heading.text })).toBeVisible();
  // The line was saved before the studio closed.
  expect(await galleryIds(page)).toHaveLength(1);
});

test('fill on a coloring page stays inside the region it starts in', async () => {
  const page = await start('band-3-5');
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../../src/features/paint-studio/coloringPages/butterfly.ts'),
    'utf8',
  );
  const { background, regions } = coloringPagePoints(source);
  const [first, ...others] = regions;
  if (first === undefined) throw new Error('The butterfly page has no regions.');

  await button(page, strings.coloringPages.text).click();
  await page.locator('[data-page="butterfly"]').click();
  // The lines arrive on their own layer.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const lines = document.querySelector<HTMLCanvasElement>('canvas[data-layer="lines"]');
        const data = lines?.getContext('2d')?.getImageData(0, 0, 1600, 1000).data ?? [];
        let solid = 0;
        for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 128) solid++;
        return solid;
      }),
    )
    .toBeGreaterThan(10_000);

  await chooseTool(page, strings['tool-fill'].text);
  const at = await screenPoint(page, first.x, first.y);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => pixelAt(page, first.x, first.y)).toEqual(RED);
  for (const point of [...others, background])
    expect(await pixelAt(page, point.x, point.y), JSON.stringify(point)).toEqual(WHITE);
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'coloring-page-filled');
});

test('a stamp lands where the child clicks', async () => {
  const page = await start('band-3-5');
  await chooseTool(page, strings['tool-stamp'].text);
  const panel = page.getByRole('dialog', { name: strings.chooseStamp.text });
  await expect(panel).toBeVisible();
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'stamps');
  await panel.getByRole('button', { name: 'Food', exact: true }).click();
  await panel.getByRole('button', { name: 'apple', exact: true }).click();
  await expect(panel).toBeHidden();
  const at = await screenPoint(page, 1200, 700);
  await page.mouse.click(at.x, at.y);
  await frames(page);
  expect(await paintedPixels(page, { x: 1150, y: 650, width: 100, height: 100 })).toBeGreaterThan(3000);
  expect(await paintedPixels(page, { x: 0, y: 0, width: 900, height: 500 })).toBe(0);
});

test('a whole-picture effect applies, and undo brings back the picture before it', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 300, 500, 1);
  await page.mouse.down();
  await mouseTo(page, 600, 500);
  await page.mouse.up();
  await frames(page);
  const before = await canvasFingerprint(page);

  await chooseTool(page, strings['tool-effects'].text);
  const panel = page.getByRole('dialog', { name: strings.chooseEffect.text });
  await expect(panel).toBeVisible();
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'effects');
  await panel.getByRole('button', { name: effectNames.mirror.text, exact: true }).click();
  // The left half folds onto the right: the stroke appears mirrored.
  await expect.poll(() => pixelAt(page, 1599 - 450, 500)).toEqual(RED);
  const after = await canvasFingerprint(page);
  expect(after).not.toBe(before);

  await button(page, strings.undo.text).click();
  await expect.poll(() => canvasFingerprint(page)).toBe(before);
  await button(page, strings.redo.text).click();
  await expect.poll(() => canvasFingerprint(page)).toBe(after);
});

test('undo waits while a whole-picture effect works, so the effect never wipes the undo', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 300, 500, 1);
  await page.mouse.down();
  await mouseTo(page, 600, 500);
  await page.mouse.up();
  await frames(page);
  const stroke = await canvasFingerprint(page);

  await chooseTool(page, strings['tool-effects'].text);
  const panel = page.getByRole('dialog', { name: strings.chooseEffect.text });
  await expect(panel).toBeVisible();
  // The child picks the effect and presses undo at once, before the effect is back from the worker.
  await panel.getByRole('button', { name: effectNames.mirror.text, exact: true }).evaluate((mirror) => {
    if (mirror instanceof HTMLElement) mirror.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  });
  await expect.poll(() => pixelAt(page, 1599 - 450, 500)).toEqual(RED);
  await expect(page.getByTestId('effect-busy')).toHaveCount(0);

  // The stroke is still one undo away, under the effect.
  await button(page, strings.undo.text).click();
  await expect.poll(() => canvasFingerprint(page)).toBe(stroke);
});

test('thirty undos and thirty redos walk the picture back and forward exactly', async () => {
  const page = await start('band-6-8');
  await chooseTool(page, strings['tool-stamp'].text);
  await page.keyboard.press('Escape');
  const steps: string[] = [await canvasFingerprint(page)];
  for (let i = 0; i < 30; i++) {
    const at = await screenPoint(page, 150 + (i % 6) * 260, 120 + Math.floor(i / 6) * 190);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => canvasFingerprint(page)).not.toBe(steps.at(-1));
    steps.push(await canvasFingerprint(page));
  }
  const undo = button(page, strings.undo.text);
  const redo = button(page, strings.redo.text);
  for (let i = 30; i > 0; i--) {
    await undo.click();
    await expect.poll(() => canvasFingerprint(page)).toBe(steps[i - 1]);
  }
  await expect(undo).toBeDisabled();
  for (let i = 1; i <= 30; i++) {
    await redo.click();
    await expect.poll(() => canvasFingerprint(page)).toBe(steps[i]);
  }
  await expect(redo).toBeDisabled();
  await expectAccessible(page);
});

test('start over clears the picture without asking, and undo brings it back', async () => {
  const page = await start('band-3-5');
  await mouseTo(page, 400, 500, 1);
  await page.mouse.down();
  await mouseTo(page, 800, 500);
  await page.mouse.up();
  await frames(page);
  const painted = await canvasFingerprint(page);
  await button(page, strings.startOver.text).click();
  await expect.poll(() => pixelAt(page, 600, 500)).toEqual(WHITE);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await button(page, strings.undo.text).click();
  await expect.poll(() => canvasFingerprint(page)).toBe(painted);
});

test('the picture saves itself and is in the gallery after a restart', async () => {
  const band = 'band-6-8';
  let page = await start(band);
  await mouseTo(page, 400, 500, 1);
  await page.mouse.down();
  await mouseTo(page, 900, 500);
  await page.mouse.up();
  await expect.poll(() => galleryIds(page), { timeout: 10_000 }).toHaveLength(1);

  launched = await restartApp(launched, { band });
  page = launched.page;
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openRoute(page, `#${PAINT_GALLERY_PATH}`);
  const cards = page.getByRole('list', { name: strings.galleryTitle.text }).getByRole('listitem');
  await expect(cards).toHaveCount(1);
  await expectAccessible(page);
  await saveScreen(page, band, 'gallery');

  await cards.first().getByRole('button', { name: strings.openPicture.text }).click();
  await expect(page.locator('.wk-paint-screen[data-ready="true"] canvas[data-layer="paint"]')).toBeVisible();
  await expect.poll(() => pixelAt(page, 650, 500)).toEqual(RED);
});

test('a picture put in the trash comes back with one click', async () => {
  const page = await start('band-3-5');
  await chooseTool(page, strings['tool-fill'].text);
  const at = await screenPoint(page, 800, 500);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => galleryIds(page), { timeout: 10_000 }).toHaveLength(1);

  await button(page, strings.gallery.text).click();
  await expect(page.locator('.wk-paint-screen[data-ready="true"]')).toBeVisible();
  const cards = page.getByRole('list', { name: strings.galleryTitle.text }).getByRole('listitem');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: strings.deletePicture.text }).click();
  await expect(cards).toHaveCount(0);
  expect(await galleryIds(page)).toEqual([]);
  // No question to answer: the picture is in the trash, and the way back is right there.
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'gallery-after-delete');

  await button(page, strings.bringBack.text).click();
  await expect(cards).toHaveCount(1);
  expect(await galleryIds(page)).toHaveLength(1);
});

test('a picture left in the trash is gone for good once the gallery closes', async () => {
  const page = await start('band-6-8');
  await chooseTool(page, strings['tool-fill'].text);
  const at = await screenPoint(page, 800, 500);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => galleryIds(page), { timeout: 10_000 }).toHaveLength(1);

  await button(page, strings.gallery.text).click();
  const cards = page.getByRole('list', { name: strings.galleryTitle.text }).getByRole('listitem');
  await cards.first().getByRole('button', { name: strings.deletePicture.text }).click();
  await expect(cards).toHaveCount(0);
  expect(await galleryIds(page, 'trash')).toHaveLength(1);

  await page.getByRole('banner').getByRole('button', { name: strings.backToPainting.text }).click();
  await expect(page.locator('.wk-paint-screen[data-ready="true"] canvas[data-layer="paint"]')).toBeVisible();
  await expect.poll(() => galleryIds(page, 'trash')).toEqual([]);
});

test('band-3-5 shows only brush, stamps, fill, eraser, and effects, as pictures', async () => {
  const page = await start('band-3-5');
  const tools = page.getByRole('toolbar', { name: strings.tools.text }).getByRole('button');
  const names = await tools.evaluateAll((buttons) => buttons.map((item) => item.textContent));
  expect(names).toEqual([
    strings['tool-brush'].text,
    strings['tool-stamp'].text,
    strings['tool-fill'].text,
    strings['tool-eraser'].text,
    strings['tool-effects'].text,
  ]);
  // The names are for screen readers only: nothing on the toolbar needs reading.
  for (const label of await page.locator('.wk-paint-tools .wk-paint-button-label').all()) {
    expect(await label.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole('group', { name: strings.colors.text }).getByRole('button')).toHaveCount(10);
  await chooseTool(page, strings['tool-effects'].text);
  await expect(
    page.getByRole('dialog', { name: strings.chooseEffect.text }).getByRole('button', { name: /./ }),
  ).toHaveCount(7);
  await expectAccessible(page);
});

test('the keyboard alone picks a tool and a color and fills at the paint cursor', async () => {
  const page = await start('band-6-8');
  const fill = page
    .getByRole('toolbar', { name: strings.tools.text })
    .getByRole('button', { name: strings['tool-fill'].text, exact: true });
  await fill.focus();
  await page.keyboard.press('Enter');
  await expect(fill).toHaveAttribute('aria-pressed', 'true');
  const blue = page
    .getByRole('group', { name: strings.colors.text })
    .getByRole('button', { name: colorNames.blue.text, exact: true });
  await blue.focus();
  await page.keyboard.press('Space');
  await expect(blue).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.wk-paint-frame').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => pixelAt(page, 100, 100)).toEqual([37, 84, 199, 255]);

  await button(page, strings.undo.text).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => pixelAt(page, 100, 100)).toEqual(WHITE);
  await expectAccessible(page);
});
