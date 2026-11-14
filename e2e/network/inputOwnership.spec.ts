import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';

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

const readSystemClipboard = () => launched.app.evaluate(({ clipboard }) => clipboard.readText());

test('system clipboard text cannot be pasted in, and copied text does not leave', async () => {
  const { page } = launched;
  await launched.app.evaluate(({ clipboard }) => clipboard.writeText('adult password'));
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

interface Press {
  keyCode: string;
  modifiers: Array<'control' | 'meta' | 'shift' | 'alt'>;
}

/**
 * Sends key presses through webContents.sendInputEvent, the native input path that raises
 * before-input-event. Playwright's keyboard goes over the DevTools protocol, which skips that
 * event, so it cannot show the block.
 */
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

test('reload, close, zoom, and DevTools shortcuts never reach the page', async () => {
  const { page } = launched;
  await page.evaluate(() => {
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

  const mod = process.platform === 'darwin' ? 'meta' : 'control';
  const devtools: Press =
    process.platform === 'darwin'
      ? { keyCode: 'I', modifiers: ['meta', 'alt'] }
      : { keyCode: 'I', modifiers: ['control', 'shift'] };
  await pressNative([
    { keyCode: 'R', modifiers: [mod] },
    { keyCode: 'F5', modifiers: [] },
    { keyCode: 'W', modifiers: [mod] },
    { keyCode: 'Q', modifiers: [mod] },
    { keyCode: '=', modifiers: [mod] },
    { keyCode: '-', modifiers: [mod] },
    { keyCode: '0', modifiers: [mod] },
    { keyCode: 'F12', modifiers: [] },
    devtools,
    // These reach the page, because the shortcut workshop teaches them.
    { keyCode: 'Z', modifiers: [mod] },
    { keyCode: 'S', modifiers: [mod] },
  ]);
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'wkcSeenKeys') as unknown))
    .toEqual([`${primary}+z`, `${primary}+s`]);

  const after = await launched.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      windows: BrowserWindow.getAllWindows().length,
      zoom: window?.webContents.getZoomFactor(),
      devtools: window?.webContents.isDevToolsOpened(),
    };
  });
  expect(after).toEqual({ windows: 1, zoom: 1, devtools: false });
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
