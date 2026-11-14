import { withDeadline } from '../core/activityKit/deadline.ts';
import { systemScheduler, type Scheduler } from '../core/activityKit/scheduler.ts';
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
export async function installTestHook(bridge: PlatformBridge, location: Pick<Location, 'search'>): Promise<void> {
  if (await isTestRun(bridge, location)) window.wkcTest = { bridge };
}

/**
 * How long the bridge may take to say what it is, in milliseconds. The app shows nothing until it
 * knows, and the main process answers at once, so this passes only when something is wrong.
 */
export const TEST_RUN_DEADLINE_MS = 5_000;

/**
 * Whether this page runs under an end-to-end test: the Electron app with WKC_TEST=1, or the
 * browser build with a `wkc-test` query parameter. Dev-only screens such as the component gallery
 * also open in a test run. A bridge that fails or does not answer within TEST_RUN_DEADLINE_MS
 * means no, so the app still starts; its late answer is dropped.
 */
export async function isTestRun(
  bridge: PlatformBridge,
  location: Pick<Location, 'search'>,
  timers: Pick<Scheduler, 'setTimeout'> = systemScheduler(),
): Promise<boolean> {
  try {
    const info = await withDeadline(bridge.info(), TEST_RUN_DEADLINE_MS, timers, 'Asking the bridge what it is');
    return info.isElectron ? info.test !== undefined : new URLSearchParams(location.search).has('wkc-test');
  } catch {
    return false;
  }
}
