import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { documentNames } from '../../src/core/platform/names.ts';
import { APP_ROOT, appLaunchEnv, launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { call, waitForBridge } from './contract.ts';

// The file store assumes one writer per data directory. A second launch on the same data must
// leave it alone, hand the child back to the window they already have, and exit.

/** The Electron binary, as the electron package reports it. */
function electronBinary(): string {
  const binary: unknown = createRequire(import.meta.url)('electron');
  if (typeof binary !== 'string') throw new Error('The electron package did not report its binary.');
  return binary;
}

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
});

/** Every file under the directory with its size and modification time. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name);
    const info = await stat(file);
    result[path.relative(dir, file)] = `${entry.isDirectory() ? 'dir' : 'file'} ${info.size} ${info.mtimeMs}`;
  }
  return result;
}

/** Starts the app the way launchApp does, on another app's data, and resolves with its exit code. */
function launchSecond(userDataDir: string): Promise<number | null> {
  const child = spawn(electronBinary(), [APP_ROOT], {
    cwd: APP_ROOT,
    env: appLaunchEnv(userDataDir),
    stdio: 'ignore',
  });
  return new Promise((resolve, reject) => {
    // Without the lock the second instance opens its own window and keeps running.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The second instance kept running.'));
    }, 15_000);
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test('a second launch on the same data exits, leaves the data alone, and brings the first window back', async () => {
  launched = await launchApp({ band: 'band-3-5' });
  const { app, page, userDataDir, dataDir } = launched;
  await waitForBridge(page);
  // A virtual display has no window manager to minimize or raise a window, so the test counts
  // focus calls on the real window. The unit test covers restoring a minimized one.
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) throw new Error('No window.');
    const focus = window.focus.bind(window);
    Reflect.set(globalThis, 'focusCalls', 0);
    window.focus = () => {
      Reflect.set(globalThis, 'focusCalls', Number(Reflect.get(globalThis, 'focusCalls')) + 1);
      focus();
    };
  });
  const before = await snapshot(dataDir);

  expect(await launchSecond(userDataDir)).toBe(0);

  expect(await snapshot(dataDir)).toEqual(before);
  await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, 'focusCalls'))).toBe(1);
  // The first instance still saves and reads.
  const name = documentNames.settings('second-launch');
  expect(await call(page, 'documents.write', name, '{"after":"second launch"}')).toMatchObject({ ok: true });
  expect(await call(page, 'documents.read', name)).toEqual({ ok: true, value: '{"after":"second launch"}' });
});
