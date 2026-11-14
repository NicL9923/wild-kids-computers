import { expect, test } from '@playwright/test';
import { strings as firstLaunchStrings } from '../../src/app/first-launch/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { tryInlineScript } from '../support/contentSecurityPolicy.ts';

test('the static renderer build loads in Chromium', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  // A fresh browser has no saved data, so the app opens on first launch.
  await expect(page.getByRole('heading', { level: 1, name: firstLaunchStrings.animalHeading.text })).toBeVisible();
  expect(errors).toEqual([]);
  // The production build carries the content security policy as a <meta> tag.
  expect(await tryInlineScript(page)).toEqual({ ran: false, blockedBy: 'script-src-elem' });
  await expectAccessible(page);
});
