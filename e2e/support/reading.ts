import { expect, type Page } from '@playwright/test';
import type { ActivityDefinition } from '../../src/core/activityKit/defineActivity.ts';
import type { Band } from '../../src/core/bands.ts';
import { openActivity, REVIEW_SIZES, saveBandScreenshot } from './activity.ts';
import { tabTo as tabToLocator } from './keyboard.ts';
import type { LaunchedApp } from './launchApp.ts';

/**
 * Helpers the letters and reading activity specs share. Each spec still computes its answers
 * from its own generateLevel.
 */

/** The band's difficulty range from the definition. */
export function rangeOf(activity: ActivityDefinition, band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error(`${activity.id} is not a rounds activity`);
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`${activity.id} does not serve ${band}`);
  return range;
}

/** Presses Tab until the element has focus, as a keyboard user would. */
export async function tabTo(page: Page, selector: string): Promise<void> {
  await tabToLocator(page, page.locator(selector));
}

/** The smallest target per band, from the spec's age band table. */
const SMALLEST_TARGET: Readonly<Record<Band, number>> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

/** The shell's top controls: exit, replay, and mute. */
const SHELL_CONTROLS = '[data-control="exit"], [data-control="replay"], [data-control="mute"]';

export interface FitOptions {
  readonly activity: ActivityDefinition;
  readonly band: Band;
  readonly seed: number;
  readonly difficulty: number;
  /** Every target the child presses, such as `[data-choice]`. */
  readonly targets: readonly string[];
  /** Waits until the round is on screen. */
  readonly ready: (page: Page) => Promise<void>;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function boxesOf(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }),
  );
}

/**
 * Opens the round at both review sizes and checks every target: fully on screen, at least the
 * band's smallest target, and clear of the shell's top controls. Saves a screenshot per size.
 * `track` receives each launch so the spec's afterEach can close it after a failure.
 */
export async function expectTargetsFit(options: FitOptions, track: (launched: LaunchedApp | undefined) => void) {
  for (const size of REVIEW_SIZES) {
    const launched = await openActivity({
      activity: options.activity.id,
      band: options.band,
      seed: options.seed,
      difficulty: options.difficulty,
      size,
    });
    track(launched);
    const { page } = launched;
    await options.ready(page);
    const controls = await boxesOf(page, SHELL_CONTROLS);
    const lowestControl = Math.max(...controls.map((box) => box.bottom));
    for (const selector of options.targets) {
      const boxes = await boxesOf(page, selector);
      expect(boxes.length, selector).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.left, selector).toBeGreaterThanOrEqual(0);
        expect(box.right, selector).toBeLessThanOrEqual(size.width);
        expect(box.top, selector).toBeGreaterThan(lowestControl);
        expect(box.bottom, selector).toBeLessThanOrEqual(size.height);
        expect(Math.min(box.right - box.left, box.bottom - box.top), selector).toBeGreaterThanOrEqual(
          SMALLEST_TARGET[options.band],
        );
      }
    }
    await saveBandScreenshot(page, options.band, options.activity.id, `${String(size.width)}x${String(size.height)}`);
    await launched.close();
    track(undefined);
  }
}
