import type { WebContents } from 'electron';
import type { OsFamily } from '../../src/core/platform/bridge.ts';
import { blockedShortcut } from './shortcuts.ts';

export interface ContentsGuardOptions {
  os: OsFamily;
  /** True only for an unpackaged dev run, which keeps reload and DevTools shortcuts. */
  devRun: boolean;
}

function deny(event: { preventDefault(): void }): void {
  event.preventDefault();
}

type GuardedContents = Pick<
  WebContents,
  'on' | 'setWindowOpenHandler' | 'setWebRTCIPHandlingPolicy' | 'setVisualZoomLevelLimits' | 'setZoomFactor'
> & { closeDevTools(): void };

/**
 * Applies to every web contents the app creates: layer 6 of the network block, the WebRTC
 * part of layer 2, the fixed zoom, and the shortcut block from "Keyboard and clipboard
 * ownership".
 */
export function guardContents(contents: GuardedContents, options: ContentsGuardOptions): void {
  // Layer 6. Programmatic loads from the main process do not raise these events.
  contents.on('will-navigate', deny);
  contents.on('will-frame-navigate', deny);
  contents.on('will-redirect', deny);
  contents.on('will-attach-webview', deny);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Layer 2. Chromium's --force-webrtc-ip-handling-policy switch has no effect in Electron 45,
  // which a probe showed by counting UDP packets, so the policy is set per web contents.
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');

  void contents.setVisualZoomLevelLimits(1, 1);
  contents.on('zoom-changed', () => contents.setZoomFactor(1));

  if (options.devRun) return;
  contents.on('before-input-event', (event, input) => {
    if (blockedShortcut(input, options.os) !== null) event.preventDefault();
  });
  contents.on('devtools-opened', () => contents.closeDevTools());
}
