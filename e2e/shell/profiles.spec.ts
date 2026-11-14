import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { strings as choiceStrings } from '../../src/app/profile-choice/strings.ts';
import { profilesDocument } from '../../src/core/storage/schemas.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import { openParentCorner, savedProfiles, waitForHome } from './shellSupport.ts';

const FOX = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
const OWL = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-9-12', name: 'Ada' } as const;
const BEE = { id: 'bee-kid', avatarId: 'bee', colorId: 'poppy', band: 'band-6-8', name: 'Maximiliana' } as const;

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

const choiceHeading = () => launched.page.getByRole('heading', { level: 1, name: choiceStrings.heading.text });
const profileButton = (id: string) => launched.page.locator(`[data-profile="${id}"]`);

test('two children: the start asks who is playing, and each child gets their own band', async () => {
  launched = await launchApp({ band: 'band-3-5' }, { documents: savedProfiles([FOX, OWL], FOX.id) });
  const { page } = launched;
  await expect(choiceHeading()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-band', 'band-3-5');

  // Avatars are at least twice the youngest band's smallest target, so a 3-year-old can hit them.
  for (const id of [FOX.id, OWL.id]) {
    const box = await profileButton(id).locator('.wk-avatar').boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(144);
  }
  await expectAccessible(page);

  await profileButton(OWL.id).click();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-band', 'band-9-12');

  await page.getByRole('button', { name: homeStrings.changePlayer.text }).click();
  await expect(choiceHeading()).toBeVisible();
  await profileButton(FOX.id).click();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-band', 'band-3-5');
});

test('the profile choice for review, with three children and a long name', async () => {
  launched = await launchApp({ band: 'band-3-5' }, { documents: savedProfiles([FOX, OWL, BEE], FOX.id) });
  for (const size of WINDOW_SIZES) {
    await resizeWindow(launched, size);
    await expect(choiceHeading()).toBeVisible({ timeout: 15_000 });
    // The choice always shows in the youngest band, so one set serves every band.
    await saveScreen(launched.page, 'band-3-5', 'shell-profile-choice');
  }
});

test('deleting a profile in the parent corner asks first and removes it from the choice', async () => {
  launched = await launchApp({ band: 'band-3-5' }, { documents: savedProfiles([FOX, OWL], FOX.id) });
  const { page } = launched;
  await resizeWindow(launched, WINDOW_SIZES[1]);
  await profileButton(FOX.id).click({ timeout: 15_000 });
  await waitForHome(page);
  await openParentCorner(page);

  const children = page.getByRole('region', { name: cornerStrings.children.text });
  await children.locator(`[data-profile="${OWL.id}"]`).getByRole('button', { name: cornerStrings.delete.text }).click();
  const confirm = page.getByRole('alertdialog', { name: cornerStrings.deleteTitle.text });
  await expect(confirm.getByText(cornerStrings.deleteWhat.text)).toBeVisible();
  await expect(confirm.getByText('Ada')).toBeVisible();
  await expectAccessible(page);
  await saveScreen(page, 'band-9-12', 'shell-parent-delete-profile');
  await confirm.getByRole('button', { name: cornerStrings.deleteConfirm.text }).click();
  await expect(confirm).toBeHidden();
  await expect(children.locator(`[data-profile="${OWL.id}"]`)).toHaveCount(0);

  const saved = profilesDocument.schema.parse(
    JSON.parse(await readFile(path.join(launched.dataDir, 'profiles.json'), 'utf8')),
  );
  expect(saved.profiles.map((profile) => profile.id)).toEqual([FOX.id]);

  // With one child left, the start goes straight to the meadow.
  await page.getByRole('button', { name: cornerStrings.back.text }).click();
  await waitForHome(page);
  await expect(page.getByRole('button', { name: homeStrings.changePlayer.text })).toHaveCount(0);
});
