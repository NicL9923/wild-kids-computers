import { expect, test } from '@playwright/test';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { tryInlineScript } from '../support/contentSecurityPolicy.ts';

test('the static renderer build loads in Chromium', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: homeStrings.title.text })).toBeVisible();
  expect(errors).toEqual([]);
  // The production build carries the content security policy as a <meta> tag.
  expect(await tryInlineScript(page)).toEqual({ ran: false, blockedBy: 'script-src-elem' });
  await expectAccessible(page);
});
