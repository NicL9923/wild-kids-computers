import { expect, test } from '@playwright/test';
import { strings as firstLaunchStrings } from '../src/app/first-launch/strings.ts';
import { expectAccessible } from './support/accessibility.ts';
import { tryInlineScript } from './support/contentSecurityPolicy.ts';
import { launchApp, type LaunchedApp } from './support/launchApp.ts';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('opens the bundled app with the renderer locked down', async () => {
  const { page } = launched;

  // A new install opens on first launch.
  await expect(page.getByRole('heading', { level: 1, name: firstLaunchStrings.animalHeading.text })).toBeVisible();
  expect(page.url()).toMatch(/^app:\/\/bundle\/index\.html/);

  // Hard rule 8: no Node in the renderer.
  const nodeGlobals = await page.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
  }));
  expect(nodeGlobals).toEqual({ require: 'undefined', process: 'undefined' });

  // The app:// content security policy is in force: an inline script does not run. This also
  // keeps the accessibility scan below honest about running under that policy.
  const inlineScriptRan = await tryInlineScript(page);
  expect(inlineScriptRan).toEqual({ ran: false, blockedBy: 'script-src-elem' });

  await expectAccessible(page);
});
