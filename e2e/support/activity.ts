import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import type { SpokenHandle } from '../../src/core/strings/defineStrings.ts';
import { readAudioLog } from './audioLog.ts';
import { documentNames } from '../../src/core/platform/names.ts';
import { settingsDocument } from '../../src/core/storage/schemas.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp, type LaunchSetup } from './launchApp.ts';
import { SCREENS_DIR } from './screens.ts';
import { ACTIVITY_PATH } from '../../src/activityShell/paths.ts';

/**
 * Helpers for activity end-to-end tests. See "End-to-end tests" in docs/architecture.md and
 * docs/adding-an-activity.md.
 */

/** The app's own window size, and the size of the screenshots for review. */
const DEFAULT_SIZE = { width: 1280, height: 800 } as const;

/** The two window sizes every activity is reviewed at. */
export const REVIEW_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
] as const;

export interface OpenActivityOptions {
  readonly activity: string;
  readonly band: Band;
  /** The session seed. Round n's level is `generateLevel(roundSeed(seed, n), difficulty, band)`. */
  readonly seed: number;
  /** The starting difficulty. The kit clamps it into the band's range. */
  readonly difficulty?: number;
  /** The window's content size. Defaults to 1280 by 800, the app's own default. */
  readonly size?: { readonly width: number; readonly height: number };
  /** Pins the kit clock at this wall time before the activity opens. Step it with `kitTime`. */
  readonly pinClockAt?: number;
  /** The parent's session length in minutes. Run it out with `advanceClock`. */
  readonly sessionMinutes?: number;
}

/** Saved settings for the ready profile with a session length, for `launchApp`'s setup. */
export function sessionLengthSetup(minutes: number | undefined): LaunchSetup {
  if (minutes === undefined) return {};
  const settings = { ...settingsDocument.defaults(), sessionLengthMinutes: minutes };
  return { documents: { [documentNames.settings(FIXTURE_PROFILE.id)]: JSON.stringify(settings) } };
}

/**
 * Launches the app with a ready profile in `band` and opens the activity. Close it with
 * `close()` in `afterEach`. Pass the same seed and difficulty to `generateLevel` to compute the
 * answers; never read them from the page.
 */
/**
 * Goes to an activity's route and waits until its screen or its step picker shows. The start
 * screen sends a ready profile to the meadow, and under load that can land after the hash
 * changed, so the route is asked for again until the activity is on screen.
 */
export async function goToActivity(page: Page, activityId: string): Promise<void> {
  const arrived = page.locator(`[data-activity="${activityId}"], [data-step]`).first();
  await expect
    .poll(
      async () => {
        if (await arrived.isVisible()) return true;
        await page.evaluate(
          (hash) => {
            if (window.location.hash !== hash) window.location.hash = hash;
          },
          `#${ACTIVITY_PATH(activityId)}`,
        );
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

export async function openActivity(options: OpenActivityOptions): Promise<LaunchedApp> {
  const launched = await launchApp(
    {
      band: options.band,
      seed: options.seed,
      ...(options.difficulty === undefined ? {} : { difficulty: options.difficulty }),
      activity: options.activity,
    },
    sessionLengthSetup(options.sessionMinutes),
  );
  try {
    // Always set the size: a virtual display's default screen is smaller than the app's window.
    await resizeWindow(launched, options.size ?? DEFAULT_SIZE);
    if (options.pinClockAt !== undefined) await kitTime(launched.page).pin(options.pinClockAt);
    await goToActivity(launched.page, options.activity);
    await expect(launched.page.locator(`[data-activity="${options.activity}"] .wk-activity-stage`)).toBeVisible();
    await expect(launched.page.locator('html')).toHaveAttribute('data-band', options.band);
    return launched;
  } catch (error) {
    await launched.close();
    throw error;
  }
}

/**
 * Resizes the window's content area, as a person resizing the window would.
 * @public
 */
export async function resizeWindow(launched: LaunchedApp, size: { width: number; height: number }): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  await expect
    .poll(() => launched.page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([size.width, size.height]);
}

/** The replay control every activity has, top center. */
function replayControl(page: Page) {
  return page.locator('[data-control="replay"]');
}

/**
 * Presses the replay control and asserts that the clip for `handle` played after the press.
 * With a pending clip, the log still records the string with `found: false`; this asserts the
 * string was spoken, and `check:voice` asserts the clip exists.
 */
export async function expectInstructionSpoken(page: Page, handle: SpokenHandle): Promise<void> {
  const before = (await readAudioLog(page)).length;
  await replayControl(page).click();
  await expect
    .poll(async () =>
      (await readAudioLog(page))
        .slice(before)
        .filter((entry) => entry.kind === 'voice')
        .map((entry) => entry.name),
    )
    .toContain(handle.id);
}

/** The voice strings spoken so far, by string id, in order. */
export async function spokenIds(page: Page): Promise<string[]> {
  return (await readAudioLog(page)).filter((entry) => entry.kind === 'voice').map((entry) => entry.name);
}

/**
 * The kit clock and frames under test control. `pin` first, before the activity opens, or pass
 * `pinClockAt` to openActivity. Each call resolves to the kit's monotonic time after it ran.
 */
export function kitTime(page: Page) {
  const call = (method: 'pin' | 'advance' | 'stepFrames', value: number) =>
    page.evaluate(
      ({ method: name, value: argument }) => {
        const hook: unknown = Reflect.get(window, 'wkcKitTime');
        if (typeof hook !== 'object' || hook === null)
          throw new Error('The kit time hook is missing. Is WKC_TEST set?');
        const fn: unknown = Reflect.get(hook, name);
        if (typeof fn !== 'function') throw new Error(`The kit time hook has no ${name}.`);
        const result: unknown = Reflect.apply(fn, hook, [argument]);
        return typeof result === 'number' ? result : Number.NaN;
      },
      { method, value },
    );
  return {
    pin: (wall: number) => call('pin', wall),
    advance: (ms: number) => call('advance', ms),
    stepFrames: (count: number) => call('stepFrames', count),
  };
}

/**
 * Writes a screenshot for review to reports/screens/<band>/<activity-id>.png. Playwright empties
 * test-results/ on every run, so screenshots never go there. Pass a
 * `variant` such as `1920x1080` to keep more than one per band. Waits for fonts and pictures.
 */
export async function saveBandScreenshot(
  page: Page,
  band: Band,
  activityId: string,
  variant?: string,
): Promise<string> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  });
  const name = variant === undefined ? `${activityId}.png` : `${activityId}@${variant}.png`;
  const file = path.join(SCREENS_DIR, band, name);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

/**
 * Runs the same tests for each band an activity serves, each band in its own describe block:
 * `forEachBand(activity.bands, (band) => { test('...', async () => { ... }) })`.
 */
export function forEachBand(bands: readonly Band[], body: (band: Band) => void): void {
  for (const band of bands) test.describe(band, () => body(band));
}

/** The center of an element, for a real mouse click with `page.mouse`. */
export async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} is not on screen.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
