import { readFile } from 'node:fs/promises';
import { defineBridgeContract, type BridgeSession } from '../bridge/contract.ts';
import { test } from '@playwright/test';

// The browser project has one page per test from Playwright's fixtures. The contract suite
// opens its own, so each test gets a fresh context and empty IndexedDB.
let browserSession: { newPage: () => Promise<BridgeSession> } | undefined;

test.beforeEach(({ browser, baseURL }) => {
  browserSession = {
    async newPage() {
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      await page.goto(`${baseURL ?? ''}/?wkc-test=1`);
      return { page, close: () => context.close() };
    },
  };
});

defineBridgeContract({
  name: 'browser',
  isElectron: false,

  open() {
    if (browserSession === undefined) throw new Error('No browser session.');
    return browserSession.newPage();
  },

  async captureExport(session, run) {
    const download = session.page.waitForEvent('download');
    const outcome = await run();
    const file = await (await download).path();
    return { outcome, saved: [...(await readFile(file))] };
  },

  // window.print opens the browser's print dialog. The stand-in measures the image the print
  // sheet shows instead.
  async capturePrint(session, run) {
    await session.page.evaluate(() => {
      window.print = () => {
        const image = document.querySelector('[data-wk-print] img');
        Reflect.set(window, 'wkcPrintedWidth', image instanceof HTMLImageElement ? image.naturalWidth : null);
      };
    });
    const outcome = await run();
    const printedWidth = await session.page.evaluate(() => {
      const width: unknown = Reflect.get(window, 'wkcPrintedWidth');
      return typeof width === 'number' ? width : null;
    });
    return { outcome, printedWidth };
  },

  // The browser build keeps a picture and its thumbnail in one IndexedDB record.
  async damageThumbnail(session, profileId, id, stored) {
    await session.page.evaluate(
      async ({ key, bytes }) => {
        const opening = indexedDB.open('wild-kids-computers');
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          opening.addEventListener('success', () => resolve(opening.result));
          opening.addEventListener('error', () => reject(opening.error ?? new Error('IndexedDB did not open.')));
        });
        const store = database.transaction('pictures', 'readwrite').objectStore('pictures');
        const reading = store.get(key);
        await new Promise((resolve) => reading.addEventListener('success', resolve));
        const record: unknown = reading.result;
        if (typeof record !== 'object' || record === null) throw new Error('No stored picture to damage.');
        const writing = store.put({ ...record, thumbnail: Uint8Array.from(bytes) });
        await new Promise((resolve) => writing.addEventListener('success', resolve));
        database.close();
      },
      { key: [profileId, id], bytes: stored },
    );
  },
});
