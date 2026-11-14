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
    // contextBridge refuses to run without context isolation, so a frozen bridge proves it.
    bridgeFrozen: Object.isFrozen(window.wkBridge),
  }));
  expect(fromPage).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    buffer: 'undefined',
    bridgeKeys: [...BRIDGE_METHODS, 'onCloseRequest', 'onMenuCommand'].toSorted(),
    bridgeFrozen: true,
  });
});

test('the renderer process runs inside the operating system sandbox', async () => {
  const facts = await launched.app.evaluate(({ app, BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined) throw new Error('No window.');
    const pid = contents.getOSProcessId();
    // Electron reports this on macOS and Windows only.
    const sandboxed = app.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed;
    return { pid, sandboxed };
  });

  if (process.platform !== 'linux') {
    expect(facts.sandboxed).toBe(true);
    return;
  }
  // On Linux the kernel says it: Chromium's sandbox installs a seccomp-bpf filter (mode 2) and
  // sets no_new_privs. A renderer started without the sandbox has neither, whatever its web
  // preferences claim.
  const status = await readFile(`/proc/${facts.pid}/status`, 'utf8');
  expect(status).toMatch(/^Seccomp:\s+2$/m);
  expect(status).toMatch(/^NoNewPrivs:\s+1$/m);
});

// The page reaches the system only through the bridge, so no page code can open a system dialog.
// Print and alert are blocked by the sandbox the content security policy sets, the File System
// Access pickers are switched off, and a click on a file input is cancelled at the root.
test('the page opens no print, alert, file chooser, or save dialog of its own', async () => {
  const { app, page } = launched;
  const ignored: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('sandboxed')) ignored.push(message.text());
  });

  const pickers = await page.evaluate(() => {
    // Each returns at once when blocked. A print dialog would hold the page here.
    window.print();
    window.alert('a dialog');
    return ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker'].map(
      (name) => typeof Reflect.get(window, name),
    );
  });
  expect(pickers).toEqual(['undefined', 'undefined', 'undefined']);
  await expect.poll(() => ignored.length).toBe(2);
  expect(ignored.join('\n')).toMatch(/print\(\)[\s\S]*allow-modals[\s\S]*alert\(\)[\s\S]*allow-modals/);

  // A real pointer click on a file input, sent the way the operating system would.
  const box = await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;height:60px;z-index:9999';
    document.body.append(input);
    const clicks: boolean[] = [];
    Reflect.set(window, 'wkcFileClicks', clicks);
    input.addEventListener('click', (event) => clicks.push(event.defaultPrevented));
    return { x: 120, y: 50 };
  });
  await app.evaluate(({ BrowserWindow }, point) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    contents?.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }, box);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'wkcFileClicks') as unknown)).toEqual([true]);

  // A drag out of the window would leave a file on the desktop.
  const dragCancelled = await page.evaluate(() => {
    const image = document.querySelector('img') ?? document.body.appendChild(document.createElement('img'));
    const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true });
    image.dispatchEvent(drag);
    return drag.defaultPrevented;
  });
  expect(dragCancelled).toBe(true);
});
