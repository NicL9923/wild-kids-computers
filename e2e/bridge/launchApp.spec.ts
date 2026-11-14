import { expect, test } from '@playwright/test';
import { documentNames } from '../../src/core/platform/names.ts';
import { loadDocument, type DocumentSpec } from '../../src/core/storage/document.ts';
import { appDocument, profilesDocument, progressDocument, settingsDocument } from '../../src/core/storage/schemas.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { call, waitForBridge } from './contract.ts';

// launchApp is the entry point of every activity test, so its fixtures must load through the
// real storage path: the bridge reads the files and the core schemas accept them.

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
});

/** Loads a document the way the app will: bridge read, then the storage core. */
async function load<T>(name: Parameters<typeof loadDocument>[1], spec: DocumentSpec<T>) {
  const page = launched?.page;
  if (page === undefined) throw new Error('No app.');
  const store = {
    read: async (documentName: string) => {
      const outcome = await call(page, 'documents.read', documentName);
      if (!outcome.ok) throw new Error(outcome.message);
      return typeof outcome.value === 'string' ? outcome.value : null;
    },
    setAside: async () => {
      throw new Error('A fixture document was rejected and would be set aside.');
    },
  };
  return loadDocument(store, name, spec);
}

test('with no options the app starts at first launch with nothing saved', async () => {
  launched = await launchApp();
  await waitForBridge(launched.page);
  expect(await load(documentNames.app, appDocument)).toMatchObject({ status: 'missing' });
  expect(await call(launched.page, 'info')).toMatchObject({ ok: true, value: { test: {} } });
});

test('with options the app starts with a ready profile in the band, and the test info', async () => {
  launched = await launchApp({ band: 'band-6-8', seed: 42, difficulty: 3 });
  await waitForBridge(launched.page);

  expect(await load(documentNames.app, appDocument)).toEqual({
    status: 'loaded',
    value: { ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: FIXTURE_PROFILE.id },
  });
  expect(await load(documentNames.profiles, profilesDocument)).toEqual({
    status: 'loaded',
    value: { version: 1, profiles: [{ ...FIXTURE_PROFILE, band: 'band-6-8' }] },
  });
  expect(await load(documentNames.settings(FIXTURE_PROFILE.id), settingsDocument)).toMatchObject({ status: 'loaded' });
  expect(await load(documentNames.progress(FIXTURE_PROFILE.id), progressDocument)).toMatchObject({ status: 'loaded' });
  expect(await call(launched.page, 'info')).toMatchObject({
    ok: true,
    value: { test: { band: 'band-6-8', seed: 42, difficulty: 3 } },
  });
});

test('an activity option opens that activity route', async () => {
  launched = await launchApp({ activity: 'pop-the-seed-pods' });
  expect(launched.page.url()).toBe('app://bundle/index.html#/activity/pop-the-seed-pods');
});

test('a bad option fails before the app starts', async () => {
  await expect(launchApp({ difficulty: 11 })).rejects.toThrow(/difficulty/);
});
