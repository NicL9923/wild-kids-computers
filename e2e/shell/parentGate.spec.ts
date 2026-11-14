import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { strings as firstLaunchStrings } from '../../src/app/first-launch/strings.ts';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { strings as gateStrings } from '../../src/app/parent-gate/strings.ts';
import { strings as paintStrings } from '../../src/features/paint-studio/strings.ts';
import { solidPng } from '../bridge/png.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { FIXTURE_PROFILE, launchApp, restartApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import {
  answerGate,
  gateDialog,
  grownUps,
  openParentCorner,
  parentCornerHeading,
  waitForHome,
  wordGateAnswer,
} from './shellSupport.ts';
import { PAINT_GALLERY_PATH } from '../../src/features/paint-studio/paths.ts';

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/**
 * The status after a wrong answer: "waiting" for the first second, then "no match". A loaded
 * machine can miss the one-second window, so the test accepts either and then waits for the
 * second. The unit test in src/app/parent-gate pins the timing.
 */
const literal = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const refused = new RegExp(`^(${literal(gateStrings.waiting.text)}|${literal(gateStrings.noMatch.text)})$`);

/** A wrong answer that cannot be right: the right one with its first digit changed. */
const wrongFor = (answer: string) => `${(Number(answer[0]) + 1) % 10}${answer.slice(1)}`;

test('the word gate refuses a wrong answer with a neutral message and opens on the right one', async () => {
  launched = await launchApp({ band: 'band-3-5' });
  const { page } = launched;
  await resizeWindow(launched, WINDOW_SIZES[1]);
  await waitForHome(page);
  await grownUps(page).click();
  const gate = gateDialog(page, 'parent-corner');
  await expect(gate).toBeVisible();
  const answer = await wordGateAnswer(page);
  expect(answer).toMatch(/^\d{3}$/);
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'shell-gate-words');

  await answerGate(page, wrongFor(answer));
  await expect(gate.getByRole('status')).toHaveText(refused);
  await expect(gate.getByLabel(gateStrings.wordLabel.text)).toHaveAttribute('aria-invalid', 'true');
  await expect(parentCornerHeading(page)).toHaveCount(0);
  await saveScreen(page, 'band-3-5', 'shell-gate-wrong');
  // The wait is short and grows; it never locks the adult out.
  await expect(gate.getByRole('status')).toHaveText(gateStrings.noMatch.text, { timeout: 3_000 });

  await answerGate(page, answer);
  await expect(parentCornerHeading(page)).toBeVisible();
  const spoken = (await readAudioLog(page)).filter((entry) => entry.kind === 'voice').map((entry) => entry.name);
  expect(spoken.filter((id) => id.startsWith('parent-gate.') || id.startsWith('numbers.'))).toEqual([]);
});

test('a parent PIN replaces the word gate, and a forgotten PIN is removed by deleting app.json', async () => {
  launched = await launchApp({ band: 'band-6-8' });
  let { page } = launched;
  await resizeWindow(launched, WINDOW_SIZES[1]);
  await waitForHome(page);
  await openParentCorner(page);

  await page.getByRole('button', { name: cornerStrings.setPin.text }).click();
  const pinDialog = page.getByRole('dialog', { name: cornerStrings.setPin.text });
  await pinDialog.getByLabel(cornerStrings.newPin.text).fill('482916');
  await pinDialog.getByLabel(cornerStrings.repeatPin.text).fill('482916');
  await pinDialog.getByRole('button', { name: cornerStrings.savePin.text }).click();
  await expect(page.getByText(cornerStrings.pinOn.text)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: cornerStrings.back.text }).click();
  await waitForHome(page);
  await grownUps(page).click();
  const gate = gateDialog(page, 'parent-corner');
  await expect(gate.getByLabel(gateStrings.pinLabel.text)).toBeVisible();
  await expect(page.getByTestId('gate-words')).toHaveCount(0);
  await gate.getByText(gateStrings.forgotPin.text).click();
  await expect(gate.getByText(gateStrings['folder-linux'].text)).toBeVisible();
  await expectAccessible(page);
  await saveScreen(page, 'band-6-8', 'shell-gate-pin');

  await answerGate(page, '111111', 'pin');
  await expect(gate.getByRole('status')).toHaveText(refused, { timeout: 10_000 });
  await expect(gate.getByRole('status')).toHaveText(gateStrings.noMatch.text, { timeout: 3_000 });
  await answerGate(page, '482916', 'pin');
  await expect(parentCornerHeading(page)).toBeVisible({ timeout: 10_000 });

  // The README's reset: close the app and delete app.json. Profiles stay, and the app asks only
  // about sound and kiosk lock before the meadow.
  await launched.app.close();
  await rm(path.join(launched.dataDir, 'app.json'));
  launched = await restartApp(launched);
  ({ page } = launched);
  await expect(page.getByRole('heading', { level: 1, name: firstLaunchStrings.soundHeading.text })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: firstLaunchStrings.next.text }).click();
  await page.getByRole('button', { name: firstLaunchStrings.finish.text }).click();
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-band', 'band-6-8');
  await grownUps(page).click();
  await expect(page.getByTestId('gate-words')).toBeVisible();
});

test('saving a picture to the computer asks the parent gate by default', async () => {
  launched = await launchApp({ band: 'band-6-8' });
  const { page } = launched;
  await waitForHome(page);
  await page.evaluate(
    async ({ profileId, png }) => {
      const bridge = window.wkcTest?.bridge;
      if (bridge === undefined) throw new Error('No test hook.');
      const bytes = Uint8Array.from(png);
      await bridge.pictures.save(profileId, { png: bytes, thumbnail: bytes });
    },
    { profileId: FIXTURE_PROFILE.id, png: solidPng(16, 10, [40, 120, 200, 255]) },
  );
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, `#${PAINT_GALLERY_PATH}`);
  await page.getByRole('button', { name: paintStrings.exportPicture.text }).click({ timeout: 15_000 });
  const gate = gateDialog(page, 'export');
  await expect(gate).toBeVisible();
  await expectAccessible(page);
  await gate.getByRole('button', { name: gateStrings.cancel.text }).click();
  await expect(gate).toBeHidden();
});
