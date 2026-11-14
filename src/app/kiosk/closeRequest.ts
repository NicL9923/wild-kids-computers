import type { Cancel } from '../../core/activityKit/scheduler.ts';
import type { PlatformBridge } from '../../core/platform/bridge.ts';
import type { RequestParentGate } from '../parent-gate/reasons.ts';
import type { QuitWorkRegistry } from './quitWork.ts';

type WindowControl = PlatformBridge['window'];

/**
 * How long a quit waits for unsaved work. A hung save must not keep the app from closing, so
 * past this the app quits anyway. Encoding and saving a picture takes well under a second.
 */
export const QUIT_DEADLINE_MS = 5_000;

const NOTHING: Cancel = () => undefined;

export interface QuitFlowOptions {
  readonly window: Pick<WindowControl, 'acknowledgeCloseRequest' | 'quit'>;
  readonly askParent: RequestParentGate;
  /** Work screens hold, such as an unsaved picture. */
  readonly work: QuitWorkRegistry;
  /** The session's queued writes. */
  readonly session: { readonly flush: () => Promise<void>; readonly hasPendingWork: () => boolean };
  /** Real time, never a test's pinned clock, so the deadline always passes. */
  readonly setTimeout: (callback: () => void, ms: number) => Cancel;
  readonly deadlineMs?: number;
}

export interface QuitFlow {
  /**
   * Kiosk lock is on and someone tried to close the app. The main process waits a few seconds
   * for an answer and then closes anyway, so this acknowledges at once, before the adult has
   * typed anything. The app quits only when the parent gate passes. Resolves to whether it quit.
   */
  closeRequested(): Promise<boolean>;
  /** An adult chose to close the app past the parent gate, such as on the closing screen. */
  quit(): Promise<boolean>;
  /**
   * The window is about to close without asking, as it does with kiosk lock off. Returns true
   * when the close must wait: the flow then finishes the work and quits by itself.
   */
  unloadRequested(): boolean;
}

/**
 * Quitting the app. Before the window closes, every piece of held work and every queued session
 * write finishes. When work fails, such as a picture that could not be saved, the app stays open
 * once, so the screen that holds it can tell the child and the adult; the next attempt quits. When
 * the work does not finish before the deadline, the app quits anyway.
 */
export function createQuitFlow(options: QuitFlowOptions): QuitFlow {
  const deadlineMs = options.deadlineMs ?? QUIT_DEADLINE_MS;
  let quitting = false;
  let stoppedOnce = false;
  let running: Promise<boolean> | null = null;

  async function finishWork(): Promise<'done' | 'failed' | 'late'> {
    let cancel = NOTHING;
    const late = new Promise<'late'>((resolve) => {
      cancel = options.setTimeout(() => resolve('late'), deadlineMs);
    });
    const work = (async () => {
      const finished = await options.work.finish();
      await options.session.flush();
      return finished ? 'done' : 'failed';
    })();
    try {
      return await Promise.race([work, late]);
    } finally {
      cancel();
    }
  }

  function finishAndQuit(): Promise<boolean> {
    running ??= (async () => {
      try {
        const outcome = await finishWork();
        if (outcome === 'failed' && !stoppedOnce) {
          stoppedOnce = true;
          return false;
        }
        quitting = true;
        await options.window.quit();
        return true;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    async closeRequested() {
      await options.window.acknowledgeCloseRequest();
      if (!(await options.askParent('quit'))) return false;
      return finishAndQuit();
    },
    quit: finishAndQuit,
    unloadRequested() {
      if (quitting) return false;
      if (running === null && !options.work.pending() && !options.session.hasPendingWork()) return false;
      void finishAndQuit();
      return true;
    },
  };
}
