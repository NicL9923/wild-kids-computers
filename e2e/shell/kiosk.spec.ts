import { expect, test } from '@playwright/test';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { strings as gateStrings } from '../../src/app/parent-gate/strings.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import { answerGate, gateDialog, openParentCorner, waitForHome, wordGateAnswer } from './shellSupport.ts';

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/** Asks the main window to close, as the window's close button or the operating system would. */
const requestClose = () => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());

const windowState = () =>
  launched.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { kiosk: window?.isKiosk() ?? false, fullscreen: window?.isFullScreen() ?? false };
  });

test('with kiosk lock on, closing asks the parent gate and quits only when it passes', async () => {
  launched = await launchApp({ band: 'band-3-5' });
  const { page } = launched;
  await resizeWindow(launched, WINDOW_SIZES[1]);
  await waitForHome(page);
  await openParentCorner(page);
  await page.getByRole('switch', { name: cornerStrings.kiosk.text }).click();
  await expect(page.getByRole('switch', { name: cornerStrings.kiosk.text })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(windowState).toMatchObject({ kiosk: true });
  await page.getByRole('button', { name: cornerStrings.back.text }).click();
  await waitForHome(page);

  await requestClose();
  const gate = gateDialog(page, 'quit');
  await expect(gate).toBeVisible();
  await expectAccessible(page);
  await saveScreen(page, 'band-3-5', 'shell-gate-quit');
  await gate.getByRole('button', { name: gateStrings.cancel.text }).click();
  await expect(gate).toBeHidden();
  // Past the main process's answer timeout, the app is still open because the shell answered.
  await page.waitForTimeout(3_500);
  expect(page.isClosed()).toBe(false);

  await requestClose();
  await expect(gate).toBeVisible();
  const exited = new Promise<void>((resolve) => launched.app.process().once('exit', () => resolve()));
  await answerGate(page, await wordGateAnswer(page));
  await exited;
});
