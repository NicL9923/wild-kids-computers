import type { PlatformBridge } from '../core/platform/bridge.ts';

/** What end-to-end tests reach from the page. Present only in a test run. */
interface WkcTestHook {
  bridge: PlatformBridge;
}

declare global {
  interface Window {
    wkcTest?: WkcTestHook;
  }
}

/**
 * Puts the bridge on `window.wkcTest` for the contract suite in e2e/bridge/. The Electron app
 * does this only when the main process runs with WKC_TEST=1. The browser build has no
 * environment, so it uses a `wkc-test` query parameter. The hook grants nothing a script in the
 * page could not already do: the page can call window.wkBridge or its own IndexedDB directly.
 */
export async function installTestHook(bridge: PlatformBridge, location: Location): Promise<void> {
  const info = await bridge.info();
  const enabled = info.isElectron ? info.test !== undefined : new URLSearchParams(location.search).has('wkc-test');
  if (enabled) window.wkcTest = { bridge };
}
