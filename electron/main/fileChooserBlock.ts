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

/**
 * Stops every system file chooser the page could open, whatever opened it: a click on a file
 * input in the document or in any shadow root, a label, the keyboard, `showPicker()`, or a
 * script. Electron 45 has no setting or event for the file chooser, so the main process takes the
 * page's file chooser requests through Chromium's DevTools protocol, which runs in this process
 * and opens no debugging port. The app never needs a chooser: export uses the bridge's save
 * dialog, which the main process shows.
 *
 * It must run before the first load: the commands queue until the page exists. Any detach while
 * the web contents lives turns the block back on. Electron gives the same reason, "target closed",
 * for its session detached from a live page and for a web contents that is closing, and reports
 * the closing one destroyed only after the detach, so the check waits one task. Reattaching at once
 * to a closing web contents would detach again, over and over, on Electron 45.3.2.
 */
const MAX_REATTACH_ATTEMPTS = 8;
const INITIAL_BACKOFF_MS = 50;

export function blockFileChoosers(
  debug: ChooserDebugger,
  isDestroyed: () => boolean,
  report: (message: string, error: unknown) => void = (message, error) => console.error(message, error),
): void {
  let consecutiveDetaches = 0;
  let scheduled = false;

  const apply = () => {
    try {
      if (!debug.isAttached()) debug.attach();
    } catch (error) {
      report('The file chooser block could not attach.', error);
      return;
    }
    let pending = FILE_CHOOSER_COMMANDS.length;
    for (const [method, params] of FILE_CHOOSER_COMMANDS) {
      debug
        .sendCommand(method, params)
        .then(() => {
          pending -= 1;
          if (pending === 0) consecutiveDetaches = 0;
          return undefined;
        })
        .catch((error: unknown) => {
          report(`The file chooser block failed at ${method}.`, error);
        });
    }
  };
  debug.on('detach', () => {
    if (scheduled) return;
    consecutiveDetaches += 1;
    if (consecutiveDetaches > MAX_REATTACH_ATTEMPTS) {
      report('The file chooser block stopped reattaching after repeated detaches.', new Error('detach loop'));
      return;
    }
    scheduled = true;
    const retry = () => {
      scheduled = false;
      if (!isDestroyed()) apply();
    };
    if (consecutiveDetaches === 1) {
      setImmediate(retry);
    } else {
      const delay = INITIAL_BACKOFF_MS * 2 ** (consecutiveDetaches - 2);
      setTimeout(retry, delay);
    }
  });
  apply();
}
