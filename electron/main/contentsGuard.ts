import type { OsFamily } from '../../src/core/platform/bridge.ts';
import { blockFileChoosers, type ChooserDebugger } from './fileChooserBlock.ts';
import { blockedShortcut, type KeyInput } from './shortcuts.ts';

export interface ContentsGuardOptions {
  os: OsFamily;
  /** True only for an unpackaged dev run, which keeps reload and DevTools shortcuts. */
  devRun: boolean;
  /** The page zoom to keep, from electron/main/windowFit.ts. 1 when not given. */
  zoomFactor?: () => number;
}

function deny(event: Cancellable): void {
  event.preventDefault();
}

type Cancellable = { preventDefault(): void };

/** The parts of WebContents the guard uses, one overload per event, so a test can supply them. */
export interface GuardedContents {
  on(event: 'will-navigate', listener: (event: Cancellable) => void): unknown;
  on(event: 'will-frame-navigate', listener: (event: Cancellable) => void): unknown;
  on(event: 'will-redirect', listener: (event: Cancellable) => void): unknown;
  on(event: 'will-attach-webview', listener: (event: Cancellable) => void): unknown;
  on(event: 'did-finish-load', listener: () => void): unknown;
  on(event: 'zoom-changed', listener: () => void): unknown;
  on(event: 'devtools-opened', listener: () => void): unknown;
  on(event: 'before-input-event', listener: (event: Cancellable, input: KeyInput) => void): unknown;
  on(
    event: 'select-bluetooth-device',
    listener: (event: Cancellable, devices: unknown[], callback: (deviceId: string) => void) => void,
  ): unknown;
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  setWebRTCIPHandlingPolicy(policy: 'disable_non_proxied_udp'): void;
  setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
  setZoomFactor(factor: number): void;
  closeDevTools(): void;
  isDestroyed(): boolean;
  readonly debugger: ChooserDebugger;
}

/**
 * Applies to every web contents the app creates: layer 6 of the network block, the WebRTC
 * part of layer 2, the file chooser block, the fixed zoom, and the shortcut block from
 * "Keyboard and clipboard ownership".
 */
export function guardContents(contents: GuardedContents, options: ContentsGuardOptions): void {
  // First, so the block is queued before the page's first script can ask for a chooser.
  blockFileChoosers(contents.debugger, () => contents.isDestroyed());

  // Layer 6. Programmatic loads from the main process do not raise these events.
  contents.on('will-navigate', deny);
  contents.on('will-frame-navigate', deny);
  contents.on('will-redirect', deny);
  contents.on('will-attach-webview', deny);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Electron picks the first Bluetooth device in range when nothing handles this. An empty id
  // cancels the request instead.
  contents.on('select-bluetooth-device', (event, _devices, callback) => {
    event.preventDefault();
    callback('');
  });

  // Layer 2. Chromium's --force-webrtc-ip-handling-policy switch has no effect in Electron 45,
  // which a probe showed by counting UDP packets, so the policy is set per web contents.
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');

  // Pinch zoom. Electron 45 rejects this call until the page has a main frame, which it does not
  // have when web-contents-created fires, so the limit is set again after every load.
  contents.on('did-finish-load', () => {
    contents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
      console.error('The pinch zoom limit did not apply.', error);
    });
  });
  // Ctrl or Command plus the wheel, and any other page zoom the shortcut block misses.
  contents.on('zoom-changed', () => contents.setZoomFactor(options.zoomFactor?.() ?? 1));

  if (options.devRun) return;
  contents.on('before-input-event', (event, input) => {
    if (blockedShortcut(input, options.os) !== null) event.preventDefault();
  });
  contents.on('devtools-opened', () => contents.closeDevTools());
}
