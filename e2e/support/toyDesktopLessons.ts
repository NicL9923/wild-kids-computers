import { expect, type Locator, type Page } from '@playwright/test';
import { centerOfLocator } from './toyDesktop.ts';

/**
 * More helpers for toy desktop lesson specs: the desktop's scale, so a spec can turn the level's
 * desktop units into a real mouse move, and the corner resize by clicks.
 */

/** CSS pixels per desktop unit, read from the desktop's drawn width and its size in units. */
export async function desktopScale(page: Page): Promise<number> {
  const desktop = page.locator('.td-desktop[data-measured="true"]');
  const units = await desktop.getAttribute('data-desktop-size');
  const box = await desktop.boundingBox();
  const width = Number(units?.split('x')[0]);
  if (box === null || !(width > 0)) throw new Error('The toy desktop is not on screen.');
  return box.width / width;
}

/** The top left corner of a window, in desktop units, from where it is drawn. */
export async function windowCorner(page: Page, window: Locator): Promise<{ x: number; y: number }> {
  const scale = await desktopScale(page);
  const desktop = await page.locator('.td-desktop').boundingBox();
  const box = await window.boundingBox();
  if (desktop === null || box === null) throw new Error('The window is not on screen.');
  return { x: (box.x - desktop.x) / scale, y: (box.y - desktop.y) / scale };
}

/**
 * Picks up an element with a click, moves the pointer by `by` CSS pixels, and puts it down with a
 * second click: the click alternative to a drag.
 */
export async function carryByClicks(page: Page, item: Locator, by: { x: number; y: number }): Promise<void> {
  const grab = await centerOfLocator(item);
  await page.mouse.click(grab.x, grab.y);
  await expect(item).toHaveAttribute('data-carried', 'true');
  await page.mouse.move(grab.x + by.x / 2, grab.y + by.y / 2, { steps: 4 });
  await page.mouse.move(grab.x + by.x, grab.y + by.y, { steps: 4 });
  await page.mouse.click(grab.x + by.x, grab.y + by.y);
}

/** Presses, drags by `by` CSS pixels, and releases. */
export async function dragBy(page: Page, item: Locator, by: { x: number; y: number }): Promise<void> {
  const grab = await centerOfLocator(item);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + by.x / 2, grab.y + by.y / 2, { steps: 6 });
  await page.mouse.move(grab.x + by.x, grab.y + by.y, { steps: 6 });
  await page.mouse.up();
}
