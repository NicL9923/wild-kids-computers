import type { PlatformBridge } from '../core/platform/bridge.ts';
import type { WkBridgeIpc } from '../core/platform/ipc.ts';
import { version } from '../../package.json';
import { createBrowserBridge } from './browserBridge.ts';
import { createElectronBridge } from './electronBridge.ts';

declare global {
  interface Window {
    /** Set by the Electron preload. Absent in the browser build. */
    wkBridge?: WkBridgeIpc;
  }
}

let bridge: PlatformBridge | undefined;

/** The Electron bridge when the preload exposed one, the browser bridge otherwise. */
export function getBridge(): PlatformBridge {
  bridge ??=
    window.wkBridge === undefined
      ? createBrowserBridge({ indexedDB: window.indexedDB, window, appVersion: version })
      : createElectronBridge(window.wkBridge);
  return bridge;
}
