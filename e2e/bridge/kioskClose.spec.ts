import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { waitForBridge } from './contract.ts';

// With kiosk lock on, a close request goes to the renderer, which shows the parent gate. The
// app quits when the renderer confirms, or after a few seconds without an answer.

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await waitForBridge(launched.page);
});

test.afterEach(async () => {
  await launched.close();
});

/** Asks the main window to close, as the window's close button or the OS would. */
const requestClose = () => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());

const exited = () =>
  new Promise<number>((resolve) => {
    const started = Date.now();
    launched.app.process().once('exit', () => resolve(Date.now() - started));
  });

test('the renderer holds a close for the parent gate and quits when the gate passes', async () => {
  const { page } = launched;
  await page.evaluate(async () => {
    const bridge = window.wkcTest?.bridge;
    if (bridge === undefined) throw new Error('No test hook.');
    Reflect.set(window, 'wkcCloseRequests', 0);
    bridge.window.onCloseRequest(() => {
      Reflect.set(window, 'wkcCloseRequests', Number(Reflect.get(window, 'wkcCloseRequests')) + 1);
      void bridge.window.acknowledgeCloseRequest();
    });
    await bridge.window.setKioskLock(true);
  });

  await requestClose();
  await expect.poll(() => page.evaluate(() => Number(Reflect.get(window, 'wkcCloseRequests')))).toBe(1);
  // Past the answer timeout, the window is still open because the renderer answered.
  await page.waitForTimeout(4_000);
  expect(page.isClosed()).toBe(false);

  const exit = exited();
  await page.evaluate(() => {
    void window.wkcTest?.bridge.window.quit();
  });
  expect(await exit).toBeLessThan(2_000);
});

test('a renderer that does not answer still lets the app close', async () => {
  const { page } = launched;
  await page.evaluate(async () => {
    const bridge = window.wkcTest?.bridge;
    if (bridge === undefined) throw new Error('No test hook.');
    bridge.window.onCloseRequest(() => void bridge.window.acknowledgeCloseRequest());
    await bridge.window.setKioskLock(true);
    // Hang the renderer's main thread, so the listener above can never run.
    setTimeout(() => {
      for (;;) {
        // A hung app.
      }
    }, 0);
  });

  const exit = exited();
  await requestClose();
  const elapsed = await exit;
  expect(elapsed).toBeGreaterThanOrEqual(2_900);
  expect(elapsed).toBeLessThan(6_000);
});

test('without kiosk lock a close goes straight through', async () => {
  const exit = exited();
  await requestClose();
  expect(await exit).toBeLessThan(2_000);
});
