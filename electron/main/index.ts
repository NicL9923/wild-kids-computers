import path from 'node:path';
import { app, protocol } from 'electron';
import { BUNDLE_SCHEME, registerBundleProtocol } from './bundleProtocol.ts';
import { createMainWindow } from './mainWindow.ts';
import { resolveStartUrl } from './startUrl.ts';
import { readTestMode } from './testMode.ts';

const testMode = readTestMode(process.env);
if (testMode.userDataDir !== undefined) app.setPath('userData', testMode.userDataDir);

// Every renderer runs sandboxed, including any window a later change forgets to configure.
app.enableSandbox();

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

app.on('window-all-closed', () => app.quit());

async function start(): Promise<void> {
  await app.whenReady();
  registerBundleProtocol(protocol, rendererRoot);
  createMainWindow({
    startUrl: resolveStartUrl({ isPackaged: app.isPackaged, devServerUrl: process.env.WKC_DEV_SERVER_URL }),
    preloadPath,
  });
}

void start();
