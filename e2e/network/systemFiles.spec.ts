import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type CDPSession } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { withSystemClipboard } from '../support/systemClipboard.ts';

// No file from the system reaches the page, and the page opens no system file chooser. The main
// process intercepts and cancels every chooser request (electron/main/fileChooserBlock.ts), the
// preload refuses showPicker on a file input and stops file drags and pastes before page scripts
// hear them (electron/preload/fileGuards.ts), and the root click guard cancels a click on a file
// input it can see (src/app/inputGuards.ts). Every input here is real: pointer, keyboard, a drag
// through the browser's own drag path, and a file on the system clipboard.

let launched: LaunchedApp;
let observer: CDPSession;
let chooserRequests: number;
let fileDir: string;
let secretFile: string;

test.beforeEach(async () => {
  launched = await launchApp({ band: 'band-6-8' });
  fileDir = await mkdtemp(path.join(os.tmpdir(), 'wkc-system-file-'));
  secretFile = path.join(fileDir, 'adult-notes.txt');
  await writeFile(secretFile, 'adult notes');
  // A second DevTools session that only watches. It sees every chooser request that reaches the
  // browser, whether or not the app's own session intercepts it.
  chooserRequests = 0;
  observer = await launched.page.context().newCDPSession(launched.page);
  observer.on('Page.fileChooserOpened', () => (chooserRequests += 1));
  await observer.send('Page.enable', { enableFileChooserOpenedEvent: true });
  // The earliest a page script can listen: on the window, in the capture phase. It records every
  // file it is handed.
  await launched.page.evaluate(() => {
    const seen: Array<{ type: string; files: number }> = [];
    Reflect.set(window, 'wkcSeenFiles', seen);
    for (const type of ['dragenter', 'dragover', 'drop', 'paste']) {
      window.addEventListener(
        type,
        (event) => {
          const data =
            event instanceof DragEvent
              ? event.dataTransfer
              : event instanceof ClipboardEvent
                ? event.clipboardData
                : null;
          seen.push({ type, files: data?.files.length ?? 0 });
        },
        { capture: true },
      );
    }
  });
});

test.afterEach(async () => {
  await launched.close();
  await rm(fileDir, { recursive: true, force: true });
});

const seenFiles = (): Promise<unknown> => launched.page.evaluate(() => Reflect.get(window, 'wkcSeenFiles') as unknown);

/**
 * Puts file inputs on the page the ways a page could: plain, behind a label, in an open shadow
 * root, in a closed one, and behind a button that calls showPicker. Each records what it hears.
 */
async function addFileInputs(): Promise<void> {
  await launched.page.evaluate(() => {
    const record: Record<string, { cancels: number; changes: number; files: () => number }> = {};
    const outcomes: Record<string, string> = {};
    Reflect.set(window, 'wkcFileInputState', (name: string) => {
      const entry = record[name];
      if (entry === undefined) throw new Error(`No input ${name}.`);
      return { cancels: entry.cancels, changes: entry.changes, files: entry.files(), outcome: outcomes[name] };
    });
    const watch = (name: string, input: HTMLInputElement) => {
      const entry = { cancels: 0, changes: 0, files: () => input.files?.length ?? 0 };
      input.addEventListener('cancel', () => (entry.cancels += 1));
      input.addEventListener('change', () => (entry.changes += 1));
      record[name] = entry;
    };
    // page.evaluate sends only this function to the page, so the helper must live inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const fileInput = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.cssText = 'width:120px;height:60px';
      return input;
    };
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;gap:10px;background:white';
    document.body.append(box);

    const plain = fileInput();
    plain.id = 'wkc-plain';
    watch('plain', plain);

    const labelled = fileInput();
    labelled.id = 'wkc-labelled';
    watch('label', labelled);
    const label = document.createElement('label');
    label.htmlFor = 'wkc-labelled';
    label.dataset.case = 'label';
    label.style.cssText = 'display:block;width:120px;height:60px';

    const picker = fileInput();
    watch('showPicker', picker);
    const button = document.createElement('button');
    button.dataset.case = 'showPicker';
    button.style.cssText = 'width:120px;height:60px';
    button.addEventListener('click', () => {
      try {
        picker.showPicker();
        outcomes.showPicker = 'returned';
      } catch (error) {
        outcomes.showPicker = error instanceof DOMException ? error.name : String(error);
      }
    });

    const hosts = (['open', 'closed'] as const).map((mode) => {
      const host = document.createElement('div');
      host.dataset.case = `${mode} shadow root`;
      const inner = fileInput();
      host.attachShadow({ mode }).append(inner);
      watch(`${mode} shadow root`, inner);
      return host;
    });

    plain.dataset.case = 'plain';
    box.append(plain, labelled, label, button, ...hosts);
  });
}

async function fileInputState(name: string): Promise<unknown> {
  return launched.page.evaluate((key) => {
    const read: unknown = Reflect.get(window, 'wkcFileInputState');
    if (typeof read !== 'function') throw new Error('No file inputs on the page.');
    return Reflect.apply(read, undefined, [key]) as unknown;
  }, name);
}

// The layer that stops each case. The closed shadow root hides its input from every page-side
// guard, so its chooser request reaches the browser and the main process cancels it.
test.describe('a click that would open a file chooser opens nothing', () => {
  for (const [name, requests, outcome] of [
    ['plain', 0, undefined],
    ['label', 0, undefined],
    ['showPicker', 0, 'NotAllowedError'],
    ['open shadow root', 0, undefined],
    ['closed shadow root', 1, undefined],
  ] as const) {
    test(`on ${name}`, async () => {
      const { page } = launched;
      await addFileInputs();
      const box = await page.locator(`[data-case="${name}"]`).boundingBox();
      if (box === null) throw new Error(`No ${name} on screen.`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      // A chooser that opened would wait for the child. The main process cancels it at once,
      // so every request that reached the browser comes back as a cancel on the input.
      await expect.poll(() => chooserRequests).toBe(requests);
      await expect.poll(() => fileInputState(name)).toEqual({ cancels: requests, changes: 0, files: 0, outcome });
      // Proving nothing else arrives needs a moment; a chooser request arrives within a frame.
      await page.waitForTimeout(500);
      expect(chooserRequests).toBe(requests);
      expect(await fileInputState(name)).toEqual({ cancels: requests, changes: 0, files: 0, outcome });
    });
  }
});

test('a file dragged onto the window never reaches the page', async () => {
  const { page } = launched;
  // The app settles on the home map first. A dropped file would navigate away from it.
  await expect(page).toHaveURL(/#\/home$/);
  const before = page.url();
  // The browser's own drag path, as a drag from the file manager arrives.
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await observer.send('Input.dispatchDragEvent', {
      type,
      x: 400,
      y: 300,
      data: { items: [], files: [secretFile], dragOperationsMask: 1 },
    });
  }
  // A marker drag with no file shows the page was listening the whole time.
  await observer.send('Input.dispatchDragEvent', {
    type: 'dragEnter',
    x: 400,
    y: 300,
    data: { items: [{ mimeType: 'text/plain', data: 'marker' }], dragOperationsMask: 1 },
  });
  await expect.poll(seenFiles).toEqual([{ type: 'dragenter', files: 0 }]);
  expect(page.url()).toBe(before);
});

test('a file on the system clipboard never reaches the page, and the toy paste still works', async () => {
  const { app, page } = launched;
  await withSystemClipboard(async () => {
    await page.evaluate(() => {
      for (const name of ['source', 'target']) {
        const field = document.createElement('textarea');
        field.setAttribute('aria-label', name);
        field.style.cssText = 'position:fixed;z-index:99999';
        document.body.append(field);
      }
    });
    const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
    const source = page.getByLabel('source', { exact: true });
    await source.focus();
    await page.keyboard.type('fern');
    await expect(source).toHaveValue('fern');
    await page.keyboard.press(`${primary}+A`);
    await page.keyboard.press(`${primary}+C`);

    // What a file manager puts on the clipboard when an adult copies a file.
    await app.evaluate(
      ({ clipboard, ClipboardItem }, uri) => clipboard.write([new ClipboardItem({ 'text/uri-list': uri })]),
      `file://${secretFile}\r\n`,
    );
    const target = page.getByLabel('target', { exact: true });
    await target.focus();
    await page.keyboard.press(`${primary}+V`);

    await expect(target).toHaveValue('fern');
    expect(await seenFiles()).toEqual([{ type: 'paste', files: 0 }]);
  });
});

/**
 * Every other system dialog or picker Chromium can open from page content, each called from its
 * own real click so it has the user activation it asks for. A request still waiting after the
 * wait below is a picker that opened, or one the app has no answer for. Color and date inputs
 * open popups drawn inside the page, so they are not here.
 *
 * How each is stopped: "missing" is a Blink feature that is off in Electron or switched off by
 * electron/main/pageSwitches.ts, "refused" is the permission and device handlers in
 * electron/main/networkBlock.ts, the content security policy, or Chromium's own origin rules, and
 * "returned" is the content security policy sandbox, which ignores modal dialogs without
 * allow-modals.
 */
const PAGE_PICKERS: ReadonlyArray<readonly [string, 'missing' | 'refused' | 'returned' | 'nothing chosen']> = [
  ['showOpenFilePicker', 'missing'],
  ['showSaveFilePicker', 'missing'],
  ['showDirectoryPicker', 'missing'],
  ['queryLocalFonts', 'nothing chosen'],
  ['serial.requestPort', 'refused'],
  ['usb.requestDevice', 'refused'],
  ['bluetooth.requestDevice', 'missing'],
  ['hid.requestDevice', 'nothing chosen'],
  ['getDisplayMedia', 'refused'],
  ['getUserMedia', 'refused'],
  ['selectAudioOutput', 'missing'],
  ['getScreenDetails', 'refused'],
  ['PaymentRequest', 'refused'],
  ['secure payment confirmation', 'refused'],
  ['credentials public key', 'refused'],
  ['credentials create', 'refused'],
  ['credentials password', 'refused'],
  ['contacts.select', 'missing'],
  ['share', 'missing'],
  ['EyeDropper', 'missing'],
  ['Notification.requestPermission', 'refused'],
  ['clipboard.read', 'refused'],
  ['print', 'returned'],
  ['alert', 'returned'],
  ['confirm', 'returned'],
  ['prompt', 'refused'],
  ['window.open', 'refused'],
];

test('no other system dialog or picker opens from a click', async () => {
  const { app, page } = launched;
  const windowsBefore = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  await page.evaluate(() => {
    /** Calls `owner[name](...args)`, or gives undefined when the page has no such function. */
    // page.evaluate sends only this function to the page, so the helper must live inside it.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const invoke = (owner: unknown, name: string, ...args: unknown[]): unknown => {
      if (typeof owner !== 'object' || owner === null) return undefined;
      const fn: unknown = Reflect.get(owner, name);
      return typeof fn === 'function' ? Reflect.apply(fn, owner, args) : undefined;
    };
    /** Calls `method` on a new `window[name](...args)`, or gives undefined when there is no such class. */
    const create = (name: string, method: string, ...args: unknown[]): unknown => {
      const type: unknown = Reflect.get(window, name);
      return typeof type === 'function' ? invoke(Reflect.construct(type, args), method) : undefined;
    };
    const challenge = new Uint8Array(16);
    const total = { total: { label: 'total', amount: { currency: 'USD', value: '1' } } };
    const confirmation = {
      supportedMethods: 'secure-payment-confirmation',
      data: {
        credentialIds: [new Uint8Array(16)],
        challenge,
        payeeOrigin: 'https://pay.example',
        rpId: 'pay.example',
        instrument: { displayName: 'card', icon: 'https://pay.example/card.png' },
      },
    };
    const calls: Record<string, () => unknown> = {
      showOpenFilePicker: () => invoke(window, 'showOpenFilePicker'),
      showSaveFilePicker: () => invoke(window, 'showSaveFilePicker'),
      showDirectoryPicker: () => invoke(window, 'showDirectoryPicker'),
      queryLocalFonts: () => invoke(window, 'queryLocalFonts'),
      'serial.requestPort': () => invoke(Reflect.get(navigator, 'serial'), 'requestPort'),
      'usb.requestDevice': () => invoke(Reflect.get(navigator, 'usb'), 'requestDevice', { filters: [] }),
      'bluetooth.requestDevice': () =>
        invoke(Reflect.get(navigator, 'bluetooth'), 'requestDevice', { acceptAllDevices: true }),
      'hid.requestDevice': () => invoke(Reflect.get(navigator, 'hid'), 'requestDevice', { filters: [] }),
      getDisplayMedia: () => navigator.mediaDevices.getDisplayMedia({ video: true }),
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
      selectAudioOutput: () => invoke(navigator.mediaDevices, 'selectAudioOutput'),
      getScreenDetails: () => invoke(window, 'getScreenDetails'),
      PaymentRequest: () => create('PaymentRequest', 'show', [{ supportedMethods: 'https://pay.example/' }], total),
      'secure payment confirmation': () => create('PaymentRequest', 'show', [confirmation], total),
      'credentials public key': () => navigator.credentials.get({ publicKey: { challenge, timeout: 1000 } }),
      'credentials create': () =>
        navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'app' },
            user: { id: new Uint8Array(4), name: 'child', displayName: 'child' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            timeout: 1000,
          },
        }),
      // The password credential option is missing from TypeScript's DOM types.
      'credentials password': () => invoke(navigator.credentials, 'get', { password: true }),
      'contacts.select': () => invoke(Reflect.get(navigator, 'contacts'), 'select', ['name']),
      share: () => invoke(navigator, 'share', { text: 'hello' }),
      EyeDropper: () => create('EyeDropper', 'open'),
      'Notification.requestPermission': () => Notification.requestPermission(),
      'clipboard.read': () => navigator.clipboard.read(),
      print: () => {
        window.print();
        return 'returned';
      },
      alert: () => {
        window.alert('hello');
        return 'returned';
      },
      confirm: () => {
        window.confirm('hello');
        return 'returned';
      },
      prompt: () => window.prompt('hello'),
      'window.open': () => window.open('about:blank') ?? Promise.reject(new Error('blocked')),
    };
    const outcomes: Record<string, string> = {};
    Reflect.set(window, 'wkcPickerOutcomes', outcomes);
    const settle = (name: string, value: unknown) => {
      if (value === 'returned') outcomes[name] = 'returned';
      else if (value === undefined) outcomes[name] = 'missing';
      else if (value === 'denied') outcomes[name] = 'refused';
      else if (Array.isArray(value) && value.length === 0) outcomes[name] = 'nothing chosen';
      else outcomes[name] = `granted ${JSON.stringify(value)}`;
    };
    const button = document.createElement('button');
    button.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:60px;z-index:99999';
    button.dataset.case = 'pickers';
    button.addEventListener('click', () => {
      const name = button.dataset.call ?? '';
      const call = calls[name];
      if (call === undefined) throw new Error(`No call ${name}.`);
      outcomes[name] = 'pending';
      try {
        const result = call();
        if (result instanceof Promise) {
          result.then(
            (value: unknown) => settle(name, value),
            () => (outcomes[name] = 'refused'),
          );
        } else settle(name, result);
      } catch {
        outcomes[name] = 'refused';
      }
    });
    document.body.append(button);
  });

  for (const [name] of PAGE_PICKERS) {
    await page.evaluate((call) => {
      const button = document.querySelector<HTMLButtonElement>('[data-case="pickers"]');
      if (button === null) throw new Error('No button.');
      button.dataset.call = call;
    }, name);
    await page.mouse.click(60, 30);
  }
  // A refusal arrives within a frame or two. A picker waiting for a choice never answers.
  await page.waitForTimeout(2000);
  const outcomes: unknown = await page.evaluate(() => Reflect.get(window, 'wkcPickerOutcomes') as unknown);
  expect(outcomes).toEqual(Object.fromEntries(PAGE_PICKERS));
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(windowsBefore);
});
