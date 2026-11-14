import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { strings } from '../../src/app/first-launch/strings.ts';
import { strings as profileStrings } from '../../src/app/profiles/strings.ts';
import { appDocument, profilesDocument } from '../../src/core/storage/schemas.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import { waitForHome } from './shellSupport.ts';

// First launch always shows in the youngest band: the setup is for a parent and a child together,
// and the youngest band wins. Its screenshots go to band-3-5 only.

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

const heading = (text: string) => launched.page.getByRole('heading', { level: 1, name: text });

async function check(name: string): Promise<void> {
  await expectAccessible(launched.page);
  await saveScreen(launched.page, 'band-3-5', `shell-first-launch-${name}`);
}

async function readSaved(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(launched.dataDir, file), 'utf8'));
}

for (const size of WINDOW_SIZES) {
  test(`from an empty data folder to the home map at ${size.width}x${size.height}, every step spoken`, async () => {
    launched = await launchApp();
    const { page } = launched;
    await resizeWindow(launched, size);

    await expect(heading(strings.animalHeading.text)).toBeVisible({ timeout: 15_000 });
    await check('animal');
    await page.getByRole('button', { name: strings.next.text }).click();
    await expect(page.getByText(strings.pickAnimalFirst.text)).toBeVisible();
    await page.getByRole('radio', { name: profileStrings['avatar-hedgehog'].text }).click({ force: true });
    await check('animal-chosen');
    await page.getByRole('button', { name: strings.next.text }).click();

    await expect(heading(strings.colorHeading.text)).toBeVisible();
    await page.getByRole('radio', { name: profileStrings['color-poppy'].text }).click({ force: true });
    await page.getByLabel(strings.nameLabel.text).fill('Juniper');
    await check('color');
    await page.getByRole('button', { name: strings.next.text }).click();

    await expect(heading(strings.bandHeading.text)).toBeVisible();
    await page.getByRole('radio', { name: new RegExp(profileStrings['band-band-3-5'].text) }).click({ force: true });
    await check('band');
    await page.getByRole('button', { name: strings.next.text }).click();

    await expect(heading(strings.soundHeading.text)).toBeVisible();
    await page.getByRole('button', { name: strings.playSound.text }).click();
    await page.getByRole('button', { name: strings.heardNo.text }).click();
    await expect(page.getByText(strings.volumeHint.text)).toBeVisible();
    await check('sound');
    await page.getByRole('button', { name: strings.next.text }).click();

    await expect(heading(strings.kioskHeading.text)).toBeVisible();
    await check('kiosk');
    await page.getByRole('button', { name: strings.finish.text }).click();

    await waitForHome(page);
    const profiles = profilesDocument.schema.parse(await readSaved('profiles.json')).profiles;
    expect(profiles).toEqual([
      { id: expect.any(String), avatarId: 'hedgehog', colorId: 'poppy', band: 'band-3-5', name: 'Juniper' },
    ]);
    expect(appDocument.schema.parse(await readSaved('app.json'))).toMatchObject({
      firstLaunchDone: true,
      kioskLock: false,
    });

    const spoken = (await readAudioLog(page)).filter((entry) => entry.kind === 'voice').map((entry) => entry.name);
    for (const step of [
      strings.animalHeading,
      strings.colorHeading,
      strings.bandHeading,
      strings.soundHeading,
      strings.kioskHeading,
    ]) {
      expect(spoken).toContain(step.id);
    }
  });
}

test('a returning child sees the home map within 3 seconds of launch', async () => {
  const started = Date.now();
  launched = await launchApp({ band: 'band-3-5' });
  await waitForHome(launched.page);
  const fromLaunch = Date.now() - started;
  const inPage = await launched.page.evaluate(() => performance.now());
  test.info().annotations.push({
    type: 'home map',
    description: `${String(Math.round(fromLaunch))} ms from launch, ${String(Math.round(inPage))} ms after the page started`,
  });
  console.log(`Home map: ${String(fromLaunch)} ms from launch, ${String(Math.round(inPage))} ms in the page.`);
  expect(fromLaunch).toBeLessThan(3_000);
});
