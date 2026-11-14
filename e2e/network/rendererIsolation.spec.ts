import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { BRIDGE_METHODS } from '../../src/core/platform/ipc.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';

// Hard rule 8: the renderer has no Node access, context isolation and the sandbox stay on, and
// the renderer reaches the system only through the one bridge object.

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('the page has no Node globals and sees only the bridge functions', async () => {
  const fromPage = await launched.page.evaluate(() => ({
    require: typeof Reflect.get(globalThis, 'require'),
    process: typeof Reflect.get(globalThis, 'process'),
    module: typeof Reflect.get(globalThis, 'module'),
    buffer: typeof Reflect.get(globalThis, 'Buffer'),
    bridgeKeys: Object.keys(window.wkBridge ?? {}).toSorted(),
    // With context isolation the bridge is a frozen copy, so the page cannot rewire it.
    bridgeFrozen: Object.isFrozen(window.wkBridge),
  }));
  expect(fromPage).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    buffer: 'undefined',
    bridgeKeys: [...BRIDGE_METHODS, 'onCloseRequest'].toSorted(),
    bridgeFrozen: true,
  });
});

test('the renderer runs with isolation and the operating system sandbox', async () => {
  const facts = await launched.app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined) throw new Error('No window.');
    const preferences = contents.getLastWebPreferences();
    return {
      pid: contents.getOSProcessId(),
      sandbox: preferences?.sandbox,
      contextIsolation: preferences?.contextIsolation,
      nodeIntegration: preferences?.nodeIntegration,
      nodeIntegrationInWorker: preferences?.nodeIntegrationInWorker,
      webviewTag: preferences?.webviewTag,
    };
  });
  expect(facts).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
  });

  // On Linux the kernel says whether the renderer process is sandboxed: Chromium's sandbox
  // installs a seccomp-bpf filter (mode 2) and sets no_new_privs. An unsandboxed renderer has
  // neither, whatever its web preferences claim.
  test.skip(process.platform !== 'linux', 'The kernel check reads /proc, which only Linux has.');
  const status = await readFile(`/proc/${facts.pid}/status`, 'utf8');
  expect(status).toMatch(/^Seccomp:\s+2$/m);
  expect(status).toMatch(/^NoNewPrivs:\s+1$/m);
});
