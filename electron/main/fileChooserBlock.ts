/** The parts of Electron's in-process debugger the block uses, so a test can supply them. */
export interface ChooserDebugger {
  attach(): void;
  isAttached(): boolean;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: 'detach', listener: (event: unknown, reason: string) => void): unknown;
}

/**
 * The DevTools protocol commands that stop the system file chooser. Interception works only with
 * the Page domain on; a probe on Electron 45.3.2 saw choosers open without it. With `cancel` the
 * input hears a cancel event, as if the child had closed the dialog, and no dialog is shown.
 */
const FILE_CHOOSER_COMMANDS: ReadonlyArray<readonly [string, Record<string, unknown> | undefined]> = [
  ['Page.enable', undefined],
  ['Page.setInterceptFileChooserDialog', { enabled: true, cancel: true }],
];

/** Electron's reason when the web contents itself goes away. Nothing is left to guard then. */
const TARGET_CLOSED = 'target closed';

/**
 * Stops every system file chooser the page could open, whatever opened it: a click on a file
 * input in the document or in any shadow root, a label, the keyboard, `showPicker()`, or a
 * script. Electron 45 has no setting or event for the file chooser, so the main process takes the
 * page's file chooser requests through Chromium's DevTools protocol, which runs in this process
 * and opens no debugging port. The app never needs a chooser: export uses the bridge's save
 * dialog, which the main process shows.
 *
 * It must run before the first load: the commands queue until the page exists. A detach other
 * than the web contents closing turns the block back on.
 */
export function blockFileChoosers(
  debug: ChooserDebugger,
  isDestroyed: () => boolean,
  report: (message: string, error: unknown) => void = (message, error) => console.error(message, error),
): void {
  const apply = () => {
    try {
      if (!debug.isAttached()) debug.attach();
    } catch (error) {
      report('The file chooser block could not attach.', error);
      return;
    }
    for (const [method, params] of FILE_CHOOSER_COMMANDS) {
      debug.sendCommand(method, params).catch((error: unknown) => {
        report(`The file chooser block failed at ${method}.`, error);
      });
    }
  };
  debug.on('detach', (_event, reason) => {
    if (reason !== TARGET_CLOSED && !isDestroyed()) apply();
  });
  apply();
}
