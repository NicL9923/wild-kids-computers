import { BrowserWindow } from 'electron';

export function createMainWindow(options: { startUrl: string; preloadPath: string }): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
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
  window.once('ready-to-show', () => window.show());
  void window.loadURL(options.startUrl);
  return window;
}
