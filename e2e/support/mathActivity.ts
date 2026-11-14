import { expect, type Page } from '@playwright/test';
import type { ActivityDefinition } from '../../src/core/activityKit/defineActivity.ts';
import type { Band } from '../../src/core/bands.ts';

/** Helpers the number and math activity specs share. */

/** The smallest target per band, as in the spec's "Age bands" table. */
const SMALLEST_TARGET: Readonly<Record<Band, number>> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

/** The difficulty range a rounds activity serves in a band. */
export function rangeOf(activity: ActivityDefinition, band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error(`${activity.id} is not a rounds activity.`);
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`${activity.id} does not serve ${band}.`);
  return range;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Every target matched by `selectors` is fully in the window, at least the band's smallest target,
 * and clear of the exit, replay, and mute controls.
 */
export async function expectTargetsFit(
  page: Page,
  band: Band,
  size: { width: number; height: number },
  selectors: readonly string[],
): Promise<void> {
  const boxesOf = (selector: string) =>
    page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      }),
    );
  for (const selector of selectors) await expect(page.locator(selector).first()).toBeVisible();
  const controls = await boxesOf('[data-control]');
  expect(controls.length).toBeGreaterThan(0);
  for (const selector of selectors) {
    const boxes = await boxesOf(selector);
    expect(boxes.length, selector).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.left, selector).toBeGreaterThanOrEqual(0);
      expect(box.top, selector).toBeGreaterThanOrEqual(0);
      expect(box.right, selector).toBeLessThanOrEqual(size.width);
      expect(box.bottom, selector).toBeLessThanOrEqual(size.height);
      expect(Math.min(box.right - box.left, box.bottom - box.top), selector).toBeGreaterThanOrEqual(
        SMALLEST_TARGET[band],
      );
      for (const control of controls) expect(overlaps(box, control), `${selector} under a control`).toBe(false);
    }
  }
}

/** Presses Tab until `selector` has focus, then Enter. Fails when Tab never reaches it. */
export async function tabToAndPress(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector);
  for (let presses = 0; presses < 40; presses += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
}
