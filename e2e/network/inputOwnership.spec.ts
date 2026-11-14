import { expect, test } from '@playwright/test';
import { SHORTCUTS } from '../../src/features/toy-desktop/model/commands.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import {
  readSystemClipboard as readClipboard,
  withSystemClipboard,
  writeSystemClipboard,
} from '../support/systemClipboard.ts';

// "Keyboard and clipboard ownership": the app never reads or writes the system clipboard, and
// app-level shortcuts are blocked while the shortcuts a lesson teaches reach the page.

let launched: LaunchedApp;
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

const readSystemClipboard = () => readClipboard(launched);

test('system clipboard text cannot be pasted in, and copied text does not leave', async () => {
  // Other workers on this display share the clipboard, so it is held until the last check.
  await withSystemClipboard(async () => {
    const { page } = launched;
    // The first launch screen moves focus when it mounts, so the probe goes in only after it has.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await writeSystemClipboard(launched, 'adult password');
    await page.evaluate(() => {
      const field = document.createElement('textarea');
      field.setAttribute('aria-label', 'probe');
      const editable = document.createElement('div');
      editable.contentEditable = 'true';
      editable.setAttribute('aria-label', 'editable probe');
      document.body.append(field, editable);
    });
    const field = page.getByLabel('probe', { exact: true });

    // Nothing copied in the app yet, so a paste brings in nothing.
    await field.focus();
    await page.keyboard.press(`${primary}+V`);
    await expect(field).toHaveValue('');

    await page.keyboard.type('a picture of a fox');
    // Every later step depends on the text being there; an empty field would pass the cut check.
    await expect(field).toHaveValue('a picture of a fox');
    await page.keyboard.press(`${primary}+A`);
    await page.keyboard.press(`${primary}+C`);
    expect(await readSystemClipboard()).toBe('adult password');

    await page.keyboard.press(`${primary}+X`);
    await expect(field).toHaveValue('');
    expect(await readSystemClipboard()).toBe('adult password');

    await page.keyboard.press(`${primary}+V`);
    await page.keyboard.press(`${primary}+V`);
    await expect(field).toHaveValue('a picture of a foxa picture of a fox');

    // A content-editable area takes the toy clipboard too.
    const editable = page.getByLabel('editable probe');
    await editable.focus();
    await page.keyboard.press(`${primary}+V`);
    await expect(editable).toHaveText('a picture of a fox');
    expect(await readSystemClipboard()).toBe('adult password');
  });
});

interface Press {
  keyCode: string;
  modifiers: Array<'control' | 'meta' | 'shift' | 'alt'>;
}

/**
 * Sends key presses through webContents.sendInputEvent, the native input path that raises
 * before-input-event. Playwright's keyboard goes over the DevTools protocol, which skips that
 * event, so it cannot show the block.
 */
/** Starts recording every non-modifier key the page sees, as "Control+Shift+s". */
async function recordKeys(): Promise<void> {
  await launched.page.evaluate(() => {
    const seen: string[] = [];
    Reflect.set(window, 'wkcSeenKeys', seen);
    window.addEventListener('keydown', (event) => {
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return;
      const mods = [
        event.ctrlKey && 'Control',
        event.metaKey && 'Meta',
        event.altKey && 'Alt',
        event.shiftKey && 'Shift',
      ];
      seen.push([...mods.filter(Boolean), event.key.toLowerCase()].join('+'));
    });
  });
}

const seenKeys = () => launched.page.evaluate(() => Reflect.get(window, 'wkcSeenKeys') as unknown);

async function windowFacts() {
  return launched.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      windows: BrowserWindow.getAllWindows().length,
      zoom: window?.webContents.getZoomFactor(),
      devtools: window?.webContents.isDevToolsOpened(),
    };
  });
}

async function pressNative(presses: Press[]): Promise<void> {
  await launched.app.evaluate(({ BrowserWindow }, keys) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined) throw new Error('No window.');
    contents.focus();
    for (const { keyCode, modifiers } of keys) {
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }
  }, presses);
}

test('reload, quit, zoom, and DevTools shortcuts never reach the page', async () => {
  await recordKeys();
  const mod = process.platform === 'darwin' ? 'meta' : 'control';
  const devtools: Press =
    process.platform === 'darwin'
      ? { keyCode: 'I', modifiers: ['meta', 'alt'] }
      : { keyCode: 'I', modifiers: ['control', 'shift'] };
  await pressNative([
    { keyCode: 'R', modifiers: [mod] },
    { keyCode: 'F5', modifiers: [] },
    { keyCode: 'Q', modifiers: [mod] },
    { keyCode: 'F4', modifiers: ['alt'] },
    { keyCode: '=', modifiers: [mod] },
    { keyCode: '-', modifiers: [mod] },
    { keyCode: '0', modifiers: [mod] },
    { keyCode: 'F12', modifiers: [] },
    devtools,
    // These reach the page, because the shortcut workshop and the toy desktop teach them.
    { keyCode: 'Z', modifiers: [mod] },
    { keyCode: 'S', modifiers: [mod] },
    { keyCode: 'W', modifiers: [mod] },
  ]);
  await expect.poll(seenKeys).toEqual([`${primary}+z`, `${primary}+s`, `${primary}+w`]);
  // The toy desktop's Close reached the page, and the real window is still open.
  expect(await windowFacts()).toEqual({ windows: 1, zoom: 1, devtools: false });
});

/** The keyCode sendInputEvent takes for a KeyboardEvent.key the toy desktop names. */
const NATIVE_KEY_CODES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

test('every shortcut the toy desktop menus show reaches the page, and the window stays open', async () => {
  await recordKeys();
  const mod = process.platform === 'darwin' ? ('meta' as const) : ('control' as const);
  const shortcuts = Object.values(SHORTCUTS);
  await pressNative(
    shortcuts.map((shortcut) => ({
      keyCode: NATIVE_KEY_CODES[shortcut.key] ?? shortcut.key,
      modifiers: [...(shortcut.primary ? [mod] : []), ...(shortcut.shift ? ['shift' as const] : [])],
    })),
  );
  await expect
    .poll(seenKeys)
    .toEqual(
      shortcuts.map((shortcut) =>
        [shortcut.primary && primary, shortcut.shift && 'Shift', shortcut.key.toLowerCase()].filter(Boolean).join('+'),
      ),
    );
  expect(await windowFacts()).toEqual({ windows: 1, zoom: 1, devtools: false });
});

test('the page cannot be zoomed by a trackpad pinch, Ctrl and the wheel, or the keyboard', async () => {
  const { app, page } = launched;
  const scale = () => page.evaluate(() => window.visualViewport?.scale ?? 0);
  // A trackpad pinch. Without the limit the same gesture doubles the scale.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', { x: 400, y: 300, scaleFactor: 2, gestureSourceType: 'mouse' });
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.sendInputEvent({ type: 'mouseWheel', x: 400, y: 300, deltaY: 240, modifiers: ['control'] });
    contents?.sendInputEvent({ type: 'mouseWheel', x: 400, y: 300, deltaY: -240, modifiers: ['control'] });
  });
  await pressNative([
    { keyCode: '=', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] },
    { keyCode: '+', modifiers: [process.platform === 'darwin' ? 'meta' : 'control', 'shift'] },
  ]);
  await page.waitForTimeout(300);
  expect(await scale()).toBe(1);
  expect(await windowFacts()).toEqual({ windows: 1, zoom: 1, devtools: false });
});

test('the application menu holds only the edit commands', async () => {
  const roles = await launched.app.evaluate(({ Menu }) =>
    (Menu.getApplicationMenu()?.items ?? []).flatMap((item) =>
      (item.submenu?.items ?? []).map((sub) => sub.role ?? sub.type),
    ),
  );
  const editRoles = new Set([
    'undo',
    'redo',
    'cut',
    'copy',
    'paste',
    'pasteandmatchstyle',
    'delete',
    'selectall',
    'separator',
  ]);
  expect(roles.length).toBeGreaterThan(0);
  expect(roles.filter((role) => !editRoles.has(role.toLowerCase()))).toEqual([]);
});
