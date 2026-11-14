import path from 'node:path';
import { app, ipcMain, Menu, powerMonitor, protocol, session } from 'electron';
import { BRIDGE_METHODS, channelFor, CLOSE_REQUEST_CHANNEL } from '../../src/core/platform/ipc.ts';
import { appMenuTemplate } from './appMenu.ts';
import { handleBridgeCall, isTrustedSender, originOf, type BridgeImplementation } from './bridgeHandlers.ts';
import { BUNDLE_SCHEME, registerBundleProtocol } from './bundleProtocol.ts';
import { guardContents } from './contentsGuard.ts';
import { createFileStore } from './fileStore.ts';
import { createMainWindow } from './mainWindow.ts';
import { applyNetworkSwitches, hardenSession, sessionControls } from './networkBlock.ts';
import { exportPicture, printPicture } from './pictureOutput.ts';
import { osFamily } from './platformInfo.ts';
import { resolveStartUrl } from './startUrl.ts';
import { readTestMode } from './testMode.ts';
import { createWindowControl } from './windowControl.ts';

const testMode = readTestMode(process.env);
if (testMode.userDataDir !== undefined) app.setPath('userData', testMode.userDataDir);

const os = osFamily(process.platform);
const startUrl = resolveStartUrl({
  isPackaged: app.isPackaged,
  devServerUrl: process.env.WKC_DEV_SERVER_URL,
  activity: testMode.info?.activity,
});
const devServer = startUrl.startsWith('http:') ? new URL(startUrl) : undefined;
const networkPolicy = { devServer };

// Every renderer runs sandboxed, including any window a later change forgets to configure.
app.enableSandbox();
applyNetworkSwitches(app.commandLine, networkPolicy);

// Must run before the ready event. Module scripts, fetch of voice clips, and media playback
// need these privileges.
protocol.registerSchemesAsPrivileged([
  {
    scheme: BUNDLE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// app.getAppPath() is the project root when unpackaged and the asar root when packaged.
const appRoot = app.getAppPath();
const rendererRoot = path.join(appRoot, 'dist', 'renderer');
const preloadPath = path.join(appRoot, 'dist', 'electron', 'preload.cjs');

app.on('web-contents-created', (_event, contents) => {
  guardContents(contents, { os, devRun: devServer !== undefined });
});
app.on('window-all-closed', () => app.quit());

async function start(): Promise<void> {
  await app.whenReady();
  await hardenSession(sessionControls(session.defaultSession), networkPolicy);
  registerBundleProtocol(protocol, rendererRoot);
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(os, app.getName())));

  const window = createMainWindow({ startUrl, preloadPath });
  const windowControl = createWindowControl(window, {
    notifyCloseRequest: () => window.webContents.send(CLOSE_REQUEST_CHANNEL),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (timer) => clearTimeout(timer),
  });
  // A crashed renderer cannot show the parent gate, and the system must be able to shut down.
  window.webContents.on('render-process-gone', () => windowControl.forceClose());
  window.on('session-end', () => windowControl.forceClose());
  powerMonitor.on('shutdown', () => windowControl.forceClose());

  const store = createFileStore(path.join(app.getPath('userData'), 'data'));
  const bridge: BridgeImplementation = {
    info: async () => ({
      os,
      appVersion: app.getVersion(),
      isElectron: true,
      ...(testMode.info === undefined ? {} : { test: testMode.info }),
    }),
    documents: store.documents,
    pictures: store.pictures,
    window: {
      getState: async () => windowControl.getState(),
      setFullscreen: async (on) => windowControl.setFullscreen(on),
      setKioskLock: async (on) => windowControl.setKioskLock(on),
      acknowledgeCloseRequest: async () => windowControl.acknowledgeCloseRequest(),
      quit: async () => windowControl.allowClose(),
    },
    output: {
      exportPicture: (png, fileStem) => exportPicture(window, png, fileStem, app.getPath('pictures')),
      printPicture: (png) => printPicture(png),
    },
  };

  const trustedOrigin = originOf(startUrl);
  const trusted = { webContentsId: window.webContents.id, origins: trustedOrigin === null ? [] : [trustedOrigin] };
  for (const method of BRIDGE_METHODS) {
    ipcMain.handle(channelFor(method), (event, ...args: unknown[]) => {
      const frame = event.senderFrame;
      const sender = {
        webContentsId: event.sender.id,
        frameUrl: frame?.url ?? null,
        isMainFrame: frame !== null && frame.parent === null,
      };
      if (!isTrustedSender(sender, trusted)) {
        return { ok: false, code: 'forbidden', message: 'The bridge answers only the app page.' };
      }
      return handleBridgeCall(bridge, method, args);
    });
  }
}

void start();
