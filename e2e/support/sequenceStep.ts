import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import type { Band } from '../../src/core/bands.ts';
import { documentNames } from '../../src/core/platform/names.ts';
import { saveDocument } from '../../src/core/storage/document.ts';
import { progressDocument } from '../../src/core/storage/schemas.ts';
import { goToActivity, kitTime, resizeWindow } from './activity.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp } from './launchApp.ts';

/**
 * Helpers for sequence activities, such as the typing course and the shortcut workshop: open an
 * activity at a step a child has reached, and read back the furthest step the app saved.
 */

async function progressText(activity: string, furthestStep: number): Promise<string> {
  let text = '';
  await saveDocument(
    {
      write: (_name, written) => {
        text = written;
        return Promise.resolve();
      },
    },
    documentNames.progress(FIXTURE_PROFILE.id),
    progressDocument,
    { version: 1, activities: { [activity]: { recentRounds: [], daysPracticed: [], furthestStep } } },
  );
  return text;
}

export interface OpenStepOptions {
  readonly activity: string;
  readonly band: Band;
  /** The step to open. Above 0, the child has reached it before and picks it on the step picker. */
  readonly step: number;
  readonly size?: { readonly width: number; readonly height: number };
  /** Pins the kit clock at this wall time before the step opens. Step it with `kitTime`. */
  readonly pinClockAt?: number;
}

/** Launches the app with a ready profile that has reached `step`, and opens that step. */
export async function openSequenceStep(options: OpenStepOptions): Promise<LaunchedApp> {
  const documents =
    options.step === 0
      ? {}
      : { [documentNames.progress(FIXTURE_PROFILE.id)]: await progressText(options.activity, options.step) };
  const launched = await launchApp({ band: options.band, seed: 7, activity: options.activity }, { documents });
  try {
    await resizeWindow(launched, options.size ?? { width: 1280, height: 800 });
    if (options.pinClockAt !== undefined) await kitTime(launched.page).pin(options.pinClockAt);
    await goToActivity(launched.page, options.activity);
    if (options.step > 0) await launched.page.locator(`[data-step="${String(options.step)}"]`).click();
    await expect(launched.page.locator(`[data-activity="${options.activity}"] .wk-activity-stage`)).toBeVisible();
    await expect(launched.page.locator('html')).toHaveAttribute('data-band', options.band);
    return launched;
  } catch (error) {
    await launched.close();
    throw error;
  }
}

/** The furthest step the app saved for the activity, as the profile's progress file says. */
export async function savedFurthestStep(launched: LaunchedApp, activity: string): Promise<number | undefined> {
  const file = path.join(launched.dataDir, 'profile', FIXTURE_PROFILE.id, 'progress.json');
  try {
    const saved: unknown = JSON.parse(await readFile(file, 'utf8'));
    const activities: unknown = Reflect.get(Object(saved), 'activities');
    const entry: unknown = Reflect.get(Object(activities), activity);
    const furthest: unknown = Reflect.get(Object(entry), 'furthestStep');
    return typeof furthest === 'number' ? furthest : undefined;
  } catch {
    return undefined;
  }
}
