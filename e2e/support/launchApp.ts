import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close: () => Promise<void>;
}

/**
 * Launches the built Electron app (run `npm run build` first; `npm run e2e` does) with a fresh
 * temporary user data directory and test hooks on. Always call `close()`, normally from a
 * fixture or `afterEach`. It closes the app and deletes the directory even if the app crashed.
 *
 * The milestone 1 signature takes `{ band, seed }` and seeds a ready profile. That arrives with
 * profiles and storage.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'wkc-e2e-'));
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [projectRoot],
      cwd: projectRoot,
      env: {
        ...process.env,
        WKC_TEST: '1',
        WKC_USER_DATA_DIR: userDataDir,
        // A test always runs the bundle, never a dev server left in the environment.
        WKC_DEV_SERVER_URL: '',
      },
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const launched = app;
    return {
      app: launched,
      page,
      userDataDir,
      close: async () => {
        await closeQuietly(launched);
        await rm(userDataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (app !== undefined) await closeQuietly(app);
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function closeQuietly(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // The app already exited. Make sure the process is gone so the run does not hang.
    app.process().kill('SIGKILL');
  }
}
