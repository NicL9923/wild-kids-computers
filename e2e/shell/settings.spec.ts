import { expect, test } from '@playwright/test';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { launchApp, restartApp, type LaunchedApp } from '../support/launchApp.ts';
import { openParentCorner, waitForHome } from './shellSupport.ts';

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

test('a setting changed in the parent corner survives a restart and applies to the whole app', async () => {
  launched = await launchApp({ band: 'band-6-8' });
  let { page } = launched;
  await waitForHome(page);
  await openParentCorner(page);

  const textSize = page.getByRole('group', { name: cornerStrings.textSize.text });
  await textSize.getByText(cornerStrings['text-size-larger'].text).click();
  await expect(page.getByText(cornerStrings.previewText.text)).toHaveAttribute('data-text-size', 'larger');
  // The parent corner itself keeps standard text; the child's screens get the new size.
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size', 'larger');
  await page.getByRole('button', { name: cornerStrings.back.text }).click();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');

  launched = await restartApp(launched);
  ({ page } = launched);
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await openParentCorner(page);
  await expect(
    page.getByRole('group', { name: cornerStrings.textSize.text }).getByRole('radio', {
      name: cornerStrings['text-size-larger'].text,
    }),
  ).toBeChecked();
});
