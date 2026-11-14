import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { LaunchedApp } from '../support/launchApp.ts';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * Closes the app and starts it again on the same saved data, the way a child comes back the next
 * day. launchApp always starts from a new directory, so this restarts with the one it made.
 */
export async function restartApp(launched: LaunchedApp, testInfo: object): Promise<LaunchedApp> {
  await launched.app.close();
  const app: ElectronApplication = await electron.launch({
    args: [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      WKC_TEST: '1',
      WKC_USER_DATA_DIR: launched.userDataDir,
      WKC_TEST_INFO: JSON.stringify(testInfo),
      WKC_DEV_SERVER_URL: '',
    },
  });
  const page: Page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    userDataDir: launched.userDataDir,
    dataDir: launched.dataDir,
    close: async () => {
      try {
        await app.close();
      } catch {
        app.process().kill('SIGKILL');
      }
      await rm(launched.userDataDir, { recursive: true, force: true });
    },
  };
}
