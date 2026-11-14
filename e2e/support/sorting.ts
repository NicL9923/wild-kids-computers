import type { Page } from '@playwright/test';
import { centerOf } from './activity.ts';

/**
 * Helpers the early learning sorting specs share: color match, shape sorter, shape builder, and
 * animal homes. Each spec still computes its answers from its own generateLevel.
 */

/** A real mouse drag from one element to another, in small steps past the click threshold. */
export async function dragTo(page: Page, from: string, to: string): Promise<void> {
  const start = await centerOf(page, from);
  const end = await centerOf(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y - 20, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Carries the focused item with the keyboard: Enter picks it up over the first place, the right
 * arrow moves on `steps` places, and Enter puts it down.
 */
export async function carryWithKeys(page: Page, steps: number): Promise<void> {
  await page.keyboard.press('Enter');
  for (let step = 0; step < steps; step += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
}
