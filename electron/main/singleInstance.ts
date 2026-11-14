/** The parts of Electron's app the lock uses, so a test can supply them. */
export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  on(event: 'second-instance', listener: () => void): unknown;
}

/** The parts of the main window a second launch brings forward. */
export interface FocusableWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
}

/**
 * Takes the single-instance lock. Returns false when another instance holds it, and the caller
 * must then exit before it opens storage. The file store assumes it is the only writer: two
 * instances saving one picture both use the same staging names, and a mismatched picture and
 * thumbnail survived recovery in a probe.
 *
 * Chromium keys the lock on the user data directory, so call this after any change to the
 * `userData` path. Each end-to-end test has its own directory and its own lock, and the suite
 * runs in parallel.
 *
 * The instance that holds the lock brings its window forward when a child launches the app
 * again, since a second click on the icon means they want the app they cannot see.
 */
export function claimSingleInstance(app: SingleInstanceApp, mainWindow: () => FocusableWindow | undefined): boolean {
  if (!app.requestSingleInstanceLock()) return false;
  app.on('second-instance', () => {
    const window = mainWindow();
    if (window === undefined || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  return true;
}
