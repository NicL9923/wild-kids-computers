import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { DEFAULT_BAND, type Band } from '../../src/core/bands.ts';
import {
  documentFileSegments,
  documentNames,
  isDocumentName,
  parseDocumentName,
  type DocumentName,
} from '../../src/core/platform/names.ts';
import { testInfoSchema, type TestInfo } from '../../src/core/platform/testInfo.ts';
import { saveDocument, type DocumentSpec } from '../../src/core/storage/document.ts';
import { appDocument, profilesDocument, progressDocument, settingsDocument } from '../../src/core/storage/schemas.ts';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

/** The profile launchApp creates when a test asks for a ready app. */
export const FIXTURE_PROFILE = { id: 'e2e-child', avatarId: 'fox', colorId: 'sky' } as const;

export interface LaunchOptions {
  /** The age band of the ready profile. Defaults to the youngest band. */
  band?: Band;
  /** The session seed the activity kit uses, so levels repeat. */
  seed?: number;
  /** The starting difficulty, 1 to 10. */
  difficulty?: number;
  /** Opens this activity's route instead of the home map. */
  activity?: string;
}

/** Saved data to write before the app starts, beyond the ready profile. */
export interface LaunchSetup {
  /** Document text by name, written over anything launchApp wrote for the ready profile. */
  documents?: Partial<Record<DocumentName, string>>;
  /** Runs on the data directory last, before the app starts, such as to damage a file. */
  prepare?: (dataDir: string) => Promise<void>;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  /** Where the main process keeps documents and pictures. */
  dataDir: string;
  close: () => Promise<void>;
}

/**
 * Launches the built Electron app (run `npm run build` first; `npm run e2e` does) with a fresh
 * temporary user data directory and test hooks on. Always call `close()`, normally from a
 * fixture or `afterEach`. It closes the app and deletes the directory even if the app crashed.
 *
 * With no argument the app starts at first launch, with nothing saved. With options it starts
 * with a ready profile in the given band: first launch done, the profile active, and default
 * settings and progress, all written through the storage schemas. The seed, difficulty, and
 * activity reach the app through `info().test`.
 */
export async function launchApp(options?: LaunchOptions, setup: LaunchSetup = {}): Promise<LaunchedApp> {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'wkc-e2e-'));
  const dataDir = path.join(userDataDir, 'data');
  try {
    const testInfo: TestInfo = testInfoSchema.parse(options === undefined ? {} : { band: DEFAULT_BAND, ...options });
    if (options !== undefined) await writeReadyProfile(dataDir, testInfo.band ?? DEFAULT_BAND);
    for (const [name, text] of Object.entries(setup.documents ?? {})) {
      if (!isDocumentName(name) || text === undefined) throw new Error(`Not a document name: ${name}`);
      await writeDocumentFile(dataDir, name, text);
    }
    await setup.prepare?.(dataDir);
    return await startApp(userDataDir, testInfo);
  } catch (error) {
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Closes the app and starts it again on the same saved data, the way a child comes back the next
 * day. The returned app's `close()` deletes the directory as before.
 */
export async function restartApp(launched: LaunchedApp, testInfo: TestInfo = {}): Promise<LaunchedApp> {
  await closeQuietly(launched.app);
  return startApp(launched.userDataDir, testInfoSchema.parse(testInfo));
}

async function startApp(userDataDir: string, testInfo: TestInfo): Promise<LaunchedApp> {
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [projectRoot],
      cwd: projectRoot,
      env: {
        ...process.env,
        WKC_TEST: '1',
        WKC_USER_DATA_DIR: userDataDir,
        WKC_TEST_INFO: JSON.stringify(testInfo),
        // A test always runs the bundle, never a dev server left in the environment.
        WKC_DEV_SERVER_URL: '',
      },
    });
    const page = await app.firstWindow();
    // Tests drive input through the debugging protocol, never through the operating system. The
    // display's real pointer rests at the middle of the screen, over the middle of the window, so
    // without this a button there gets hover events no test sent, and speaks over the round.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.setIgnoreMouseEvents(true);
    });
    await page.waitForLoadState('domcontentloaded');
    const launched = app;
    return {
      app: launched,
      page,
      userDataDir,
      dataDir: path.join(userDataDir, 'data'),
      close: async () => {
        await closeQuietly(launched);
        await rm(userDataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (app !== undefined) await closeQuietly(app);
    throw error;
  }
}

async function writeReadyProfile(dataDir: string, band: Band): Promise<void> {
  const store = { write: (name: DocumentName, text: string) => writeDocumentFile(dataDir, name, text) };
  const save = <T>(name: DocumentName, spec: DocumentSpec<T>, value: T) => saveDocument(store, name, spec, value);
  await save(documentNames.app, appDocument, {
    ...appDocument.defaults(),
    firstLaunchDone: true,
    lastActiveProfileId: FIXTURE_PROFILE.id,
  });
  await save(documentNames.profiles, profilesDocument, { version: 1, profiles: [{ ...FIXTURE_PROFILE, band }] });
  await save(documentNames.settings(FIXTURE_PROFILE.id), settingsDocument, settingsDocument.defaults());
  await save(documentNames.progress(FIXTURE_PROFILE.id), progressDocument, progressDocument.defaults());
}

/** Writes a document where the main process reads it, using the shared name-to-file mapping. */
async function writeDocumentFile(dataDir: string, name: DocumentName, text: string): Promise<void> {
  const parsed = parseDocumentName(name);
  if (parsed === null) throw new Error(`Not a document name: ${name}`);
  const file = path.join(dataDir, ...documentFileSegments(parsed));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function closeQuietly(app: ElectronApplication): Promise<void> {
  try {
    await app.close();
  } catch {
    // The app already exited. Make sure the process is gone so the run does not hang.
    app.process().kill('SIGKILL');
  }
}
