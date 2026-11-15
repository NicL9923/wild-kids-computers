import { BrowserWindow } from 'electron';
import type { OsFamily } from '../../src/core/platform/bridge.ts';

/** The page color from src/styles/tokens.css, so the window never flashes white before the page paints. */
const PAGE_COLOR = '#eef5e6';

export function createMainWindow(options: {
  startUrl: string;
  preloadPath: string;
  os: OsFamily;
  /** The window icon on Linux. macOS and Windows take the icon from the app bundle. */
  icon: string | undefined;
}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: PAGE_COLOR,
    ...(options.icon === undefined ? {} : { icon: options.icon }),
    // The edit menu exists for its shortcuts. A child never sees a menu bar.
    autoHideMenuBar: false,
    webPreferences: {
      preload: options.preloadPath,
      // Hard rule 8: the renderer has no Node access.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      // A spoken instruction plays when a round starts, before the child has clicked anything.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  window.setMenuBarVisibility(false);
  showWhenReady(window, options.os);
  void window.loadURL(options.startUrl);
  return window;
}

/** The parts of BrowserWindow that showing it uses, so a test can supply them. */
export interface ShowableWindow {
  once(event: 'ready-to-show', listener: () => void): unknown;
  isDestroyed(): boolean;
  isVisible(): boolean;
  show(): void;
  readonly webContents: { once(event: 'did-finish-load', listener: () => void): unknown };
}

/**
 * Shows the hidden window once its page has painted. On Linux under Wayland a hidden window has
 * no surface yet, so Chromium never paints it and `ready-to-show` never comes: the app would run,
 * speak its first instruction, and show nothing. There the window also shows when the page has
 * loaded, whichever comes first. The background color covers the moment before the first paint.
 */
export function showWhenReady(window: ShowableWindow, os: OsFamily): void {
  const show = () => {
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  };
  window.once('ready-to-show', show);
  if (os === 'linux') window.webContents.once('did-finish-load', show);
}
