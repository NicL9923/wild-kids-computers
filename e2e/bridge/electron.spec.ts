import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { defineBridgeContract, type BridgeSession } from './contract.ts';

const apps = new WeakMap<BridgeSession, LaunchedApp>();

function appOf(session: BridgeSession): LaunchedApp {
  const app = apps.get(session);
  if (app === undefined) throw new Error('The session did not come from launchApp.');
  return app;
}

defineBridgeContract({
  name: 'electron',
  isElectron: true,

  async open() {
    const launched = await launchApp();
    const session = { page: launched.page, close: launched.close };
    apps.set(session, launched);
    return session;
  },

  // The save dialog is native, so the test answers it by replacing showSaveDialog in the main
  // process. That is the only stand-in. The write to disk is real.
  async captureExport(session, run) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wkc-export-'));
    try {
      const chosen = path.join(dir, 'chosen-name');
      await appOf(session).app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, chosen);
      const outcome = await run();
      // The adult typed no extension, so the app adds .png.
      const saved = await readFile(`${chosen}.png`).then(
        (data) => [...data],
        () => null,
      );
      return { outcome, saved };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },

  // The print dialog is native too. The stand-in replaces WebContents.print and, in place of
  // printing, measures the image the hidden print window loaded.
  async capturePrint(session, run) {
    const { app } = appOf(session);
    await app.evaluate(({ webContents }) => {
      const first = webContents.getAllWebContents()[0];
      if (first === undefined) throw new Error('No web contents.');
      const prototype: unknown = Object.getPrototypeOf(first);
      if (typeof prototype !== 'object' || prototype === null) throw new Error('No WebContents prototype.');
      Reflect.set(
        prototype,
        'print',
        async function print(
          this: Electron.WebContents,
          _options: unknown,
          callback: (success: boolean, reason: string) => void,
        ) {
          const width: unknown = await this.executeJavaScript('document.querySelector("img").naturalWidth');
          Reflect.set(globalThis, 'wkcPrintedWidth', width);
          callback(true, '');
        },
      );
    });
    const outcome = await run();
    const printedWidth = await app.evaluate(() => {
      const width: unknown = Reflect.get(globalThis, 'wkcPrintedWidth');
      return typeof width === 'number' ? width : null;
    });
    return { outcome, printedWidth };
  },

  async damageThumbnail(session, profileId, id, stored) {
    const file = path.join(appOf(session).dataDir, 'profile', profileId, 'pictures', `${id}.thumb.png`);
    await writeFile(file, Uint8Array.from(stored));
  },
});
