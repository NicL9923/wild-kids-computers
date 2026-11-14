import { expect, type Locator, type Page } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import type { LaunchedApp } from './launchApp.ts';
import { smallestTargets } from './toyDesktop.ts';

/**
 * Helpers that toy desktop lesson specs share: the band's difficulty range, the smallest target
 * each band allows, and the modifier key of this computer for shortcuts.
 */

/** The smallest target of each band in CSS pixels, from `--wk-target-min`. */
export const TARGET_MIN: Readonly<Record<Band, number>> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

/** The modifier of a shortcut on the computer running the tests, as Playwright names it. */
export const PRIMARY = process.platform === 'darwin' ? 'Meta' : 'Control';

/** The difficulty range of a rounds lesson for a band. */
export function lessonRange(
  activity: { readonly id: string } & (
    | { readonly kind: 'rounds'; readonly difficulty: Readonly<Partial<Record<Band, { min: number; max: number }>>> }
    | { readonly kind: 'sequence' | 'free' }
  ),
  band: Band,
): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error(`${activity.id} is not a rounds activity`);
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`${activity.id} has no range for ${band}`);
  return range;
}

/** Every control matching the selector is at least the band's smallest target. */
export async function expectTargetsAtLeast(page: Page, band: Band, selector: string): Promise<void> {
  const sizes = await smallestTargets(page, selector);
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(TARGET_MIN[band] - 0.5);
}

/**
 * A control drawn smaller than a target still takes a click anywhere in a full target around its
 * center: each edge of that square lands on the control.
 */
export async function expectHitArea(page: Page, band: Band, control: Locator): Promise<void> {
  const box = await control.boundingBox();
  if (box === null) throw new Error('The control is not on screen.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reach = TARGET_MIN[band] / 2 - 1;
  const points = [
    { x: center.x - reach, y: center.y },
    { x: center.x + reach, y: center.y },
    { x: center.x, y: center.y - reach },
    { x: center.x, y: center.y + reach },
  ];
  const handle = await control.elementHandle();
  for (const point of points) {
    const hit = await page.evaluate(
      ({ at, element }) => {
        const found = document.elementFromPoint(at.x, at.y);
        return found !== null && element !== null && element.contains(found);
      },
      { at: point, element: handle },
    );
    expect(hit, `a click at ${String(point.x)}, ${String(point.y)} reaches the control`).toBe(true);
  }
}

/** The modifier of a shortcut on the computer running the tests, as Electron's input events name it. */
const NATIVE_PRIMARY = process.platform === 'darwin' ? 'meta' : 'control';

/**
 * Presses a shortcut, the primary modifier with a key and Shift when asked, through
 * `webContents.sendInputEvent`: the path a real keyboard takes, which also reaches the
 * application menu's edit shortcuts. Playwright's keyboard skips that path.
 */
export async function pressShortcut(app: LaunchedApp, keyCode: string, shift = false): Promise<void> {
  const modifiers = shift ? [NATIVE_PRIMARY, 'shift'] : [NATIVE_PRIMARY];
  await app.app.evaluate(
    ({ BrowserWindow }, press) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      if (contents === undefined) throw new Error('No window.');
      contents.focus();
      contents.sendInputEvent({ type: 'keyDown', keyCode: press.keyCode, modifiers: press.modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode: press.keyCode, modifiers: press.modifiers });
    },
    { keyCode, modifiers },
  );
}

/** The app inside a window shows whole, with nothing to scroll to: no key or picture is cut off. */
export async function expectWholeApp(window: Locator): Promise<void> {
  const overflow = await window
    .locator('.td-window-body')
    .evaluate((body) => ({ x: body.scrollWidth - body.clientWidth, y: body.scrollHeight - body.clientHeight }));
  expect(overflow).toEqual({ x: 0, y: 0 });
}
