import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { startProbeServer, type ProbeServer } from './probeServer.ts';

// One test per main-process layer of the network block, each observed on its own so that a
// layer cannot go missing behind the others. noNetwork.spec.ts covers all layers together.

let launched: LaunchedApp;
let probe: ProbeServer;

test.beforeEach(async () => {
  probe = await startProbeServer();
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
  await probe.close();
});

test('layer 1: the request filter cancels a request before the proxy sees it', async () => {
  const url = `http://127.0.0.1:${probe.port}/main-process`;
  const error = await launched.app.evaluate(async ({ session }, target) => {
    try {
      await session.defaultSession.fetch(target);
      return 'reached';
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, url);
  // A request the filter missed would fail at the dead proxy with ERR_PROXY_CONNECTION_FAILED.
  expect(error).toContain('ERR_BLOCKED_BY_CLIENT');
  expect(probe.seen()).toEqual([]);
});

test('layer 2: outside host names do not resolve and background networking is off', async () => {
  const result = await launched.app.evaluate(async ({ app, session }) => {
    let resolved: string;
    try {
      resolved = JSON.stringify(await session.defaultSession.resolveHost('example.com'));
    } catch (caught) {
      resolved = caught instanceof Error ? caught.message : String(caught);
    }
    return {
      resolved,
      backgroundNetworking: app.commandLine.hasSwitch('disable-background-networking'),
      componentUpdate: app.commandLine.hasSwitch('disable-component-update'),
    };
  });
  expect(result).toEqual({
    resolved: expect.stringContaining('ERR_NAME_NOT_RESOLVED'),
    backgroundNetworking: true,
    componentUpdate: true,
  });
});

test('layer 3: every address, loopback included, goes to the dead proxy', async () => {
  const proxies = await launched.app.evaluate(async ({ session }, port) => {
    const resolve = (url: string) => session.defaultSession.resolveProxy(url);
    return [
      await resolve(`http://127.0.0.1:${port}/`),
      await resolve('http://localhost/'),
      await resolve('https://example.com/'),
      await resolve(`ws://127.0.0.1:${port}/`),
    ];
  }, probe.port);
  expect(proxies).toEqual(Array.from({ length: 4 }, () => 'PROXY 127.0.0.1:9'));
});

test('the session cancels a download, even one the main process starts', async () => {
  const outcome = await launched.app.evaluate(({ BrowserWindow, session }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined) throw new Error('No window.');
    return new Promise<boolean>((resolve) => {
      session.defaultSession.once('will-download', (event) => resolve(event.defaultPrevented));
      contents.downloadURL('data:text/plain,not%20saved');
    });
  });
  expect(outcome).toBe(true);
});

test('layer 4: the spellchecker is off', async () => {
  const enabled = await launched.app.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled());
  expect(enabled).toBe(false);
});

test('layer 6: a webview cannot attach', async () => {
  const { page } = launched;
  const attached = await page.evaluate(async (url) => {
    const webview = document.createElement('webview');
    webview.setAttribute('src', url);
    document.body.append(webview);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    // A working webview tag upgrades the element and gives it a getURL method.
    return 'getURL' in webview;
  }, `http://127.0.0.1:${probe.port}/webview`);
  expect(attached).toBe(false);
  expect(launched.app.windows()).toHaveLength(1);
  expect(probe.seen()).toEqual([]);
});

test('layer 7: every permission request and check is denied', async () => {
  const { page } = launched;
  const names: PermissionName[] = ['geolocation', 'camera', 'microphone'];
  const permissions = await page.evaluate(async (permissionNames) => {
    const states: Record<string, string> = {};
    for (const name of permissionNames) states[name] = (await navigator.permissions.query({ name })).state;
    states.notifications = await Notification.requestPermission();
    try {
      await navigator.clipboard.readText();
      states.clipboard = 'read';
    } catch (caught) {
      states.clipboard = caught instanceof Error ? caught.name : String(caught);
    }
    return states;
  }, names);
  expect(permissions).toEqual({
    geolocation: 'denied',
    camera: 'denied',
    microphone: 'denied',
    notifications: 'denied',
    clipboard: 'NotAllowedError',
  });
});
