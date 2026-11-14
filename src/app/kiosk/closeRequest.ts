import type { PlatformBridge } from '../../core/platform/bridge.ts';
import type { RequestParentGate } from '../parent-gate/reasons.ts';

type WindowControl = PlatformBridge['window'];

/** Saves every queued write, then quits. Used after the gate passes. */
export async function quitApp(window: Pick<WindowControl, 'quit'>, flush: () => Promise<void>): Promise<void> {
  await flush();
  await window.quit();
}

/**
 * Answers a close request under kiosk lock. The main process waits a few seconds for an answer
 * and then closes anyway, so the renderer acknowledges at once, before the adult has typed
 * anything. The app quits only when the parent gate passes. Returns whether it quit.
 */
export async function answerCloseRequest(
  window: Pick<WindowControl, 'acknowledgeCloseRequest' | 'quit'>,
  askParent: RequestParentGate,
  flush: () => Promise<void>,
): Promise<boolean> {
  await window.acknowledgeCloseRequest();
  if (!(await askParent('quit'))) return false;
  await quitApp(window, flush);
  return true;
}
