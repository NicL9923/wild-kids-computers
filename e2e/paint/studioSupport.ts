import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import type { Band } from '../../src/core/bands.ts';
import type { LaunchedApp } from '../support/launchApp.ts';

/**
 * Helpers for the paint studio's end-to-end tests. Canvas checks read pixels back from the page's
 * own canvas, never from a screenshot.
 */

/**
 * Screenshots for review. Playwright empties test-results/ before every run, so these go to
 * reports/, which it leaves alone and git ignores.
 */
const SCREENS_DIR = path.resolve(import.meta.dirname, '..', '..', 'reports', 'screens');

export const WINDOW_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
] as const;

export async function resizeWindow(launched: LaunchedApp, size: { width: number; height: number }): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  await expect
    .poll(() => launched.page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([size.width, size.height]);
}

/** Opens a hash route and waits until the screen says it is ready. */
export async function openRoute(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
  await expect(page.locator('.wk-paint-screen[data-ready="true"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  });
}

export const openStudio = (page: Page): Promise<void> => openRoute(page, '#/paint');

export async function saveScreen(page: Page, band: Band, name: string): Promise<void> {
  const size = await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
  await page.screenshot({ path: path.join(SCREENS_DIR, band, `paint-${name}-${size}.png`) });
}

/** The paint canvas, whose pixels the tests read. */
const paintCanvas = (page: Page) => page.locator('canvas[data-layer="paint"]');

/** The RGBA of a document pixel, read from the visible paint canvas. */
export async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ x: px, y: py }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
      const data = canvas?.getContext('2d')?.getImageData(px, py, 1, 1).data;
      return data === undefined ? [] : [...data];
    },
    { x, y },
  );
}

/** A hash of every pixel on the paint canvas, to compare two states of the picture exactly. */
export async function canvasFingerprint(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
    const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (data === undefined) return '';
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  });
}

/** How many pixels in a document rectangle are not white paper. */
export async function paintedPixels(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number> {
  return page.evaluate((area) => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
    const data = canvas?.getContext('2d')?.getImageData(area.x, area.y, area.width, area.height).data;
    if (data === undefined) return 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) count++;
    }
    return count;
  }, rect);
}

/** Where a document point lands on the screen, for real mouse events. */
export async function screenPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await paintCanvas(page).boundingBox();
  if (box === null) throw new Error('The paint canvas is not on screen.');
  return { x: box.x + (x / 1600) * box.width, y: box.y + (y / 1000) * box.height };
}

/** Waits for the next two animation frames, so a change has reached the canvas. */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** The id of the profile launchApp creates, whose pictures the tests read. */
const PROFILE_ID = 'e2e-child';

/** Gallery picture ids of the test profile, newest first, read through the app's own bridge. */
export async function galleryIds(page: Page): Promise<string[]> {
  return page.evaluate(async (profileId) => {
    const bridge = window.wkcTest?.bridge;
    if (bridge === undefined) return [];
    return (await bridge.pictures.list(profileId, 'gallery')).map((picture) => picture.id);
  }, PROFILE_ID);
}

/** A coloring page's points, read from its entry file, so the test does not ask the page for answers. */
export function coloringPagePoints(source: string): {
  background: { x: number; y: number };
  regions: { x: number; y: number }[];
} {
  const point = /\{ x: (\d+), y: (\d+) \}/g;
  const background = /background: (\{ x: \d+, y: \d+ \})/.exec(source)?.[1];
  const regions = /regions: \[([\s\S]*?)\]/.exec(source)?.[1];
  if (background === undefined || regions === undefined) throw new Error('Could not read the coloring page points.');
  const parse = (text: string) =>
    [...text.matchAll(point)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const [first] = parse(background);
  if (first === undefined) throw new Error('No background point.');
  return { background: first, regions: parse(regions) };
}
