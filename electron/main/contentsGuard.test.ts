import { describe, expect, it } from 'vitest';
import { guardContents, type GuardedContents } from './contentsGuard.ts';
import type { KeyInput } from './shortcuts.ts';

/** Any listener the guard adds. Each event passes its own arguments. */
type Listener = (...args: never[]) => void;

const NO_EVENT = { preventDefault: () => undefined };
const NO_KEY: KeyInput = { key: '', code: '', control: false, meta: false, alt: false, shift: false };

/** A web contents that records listeners and calls. Anything the guard does not use throws. */
function fakeContents(zoomLimits: () => Promise<void>) {
  const listeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  const debuggerCalls: string[] = [];
  const contents: GuardedContents = {
    isDestroyed: () => false,
    debugger: {
      attach: () => void debuggerCalls.push('attach'),
      isAttached: () => debuggerCalls.includes('attach'),
      sendCommand: (method) => {
        debuggerCalls.push(method);
        return Promise.resolve({});
      },
      on: () => undefined,
    },
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    setWindowOpenHandler: () => undefined,
    setWebRTCIPHandlingPolicy: () => undefined,
    setVisualZoomLevelLimits(minimum, maximum) {
      calls.push(`zoom limits ${String(minimum)} ${String(maximum)}`);
      return zoomLimits();
    },
    setZoomFactor: (factor) => void calls.push(`zoom factor ${String(factor)}`),
    closeDevTools: () => void calls.push('close devtools'),
  };
  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) Reflect.apply(listener, undefined, [NO_EVENT, NO_KEY]);
  };
  /** The one listener for an event, called with whatever arguments Electron would pass. */
  const listenerFor = (event: string) => {
    const [listener] = listeners.get(event) ?? [];
    if (listener === undefined) throw new Error(`No listener for ${event}.`);
    return (...args: unknown[]) => void Reflect.apply(listener, undefined, args);
  };
  return { contents, calls, debuggerCalls, emit, listenerFor };
}

describe('guardContents Bluetooth', () => {
  it('cancels a Bluetooth device request instead of letting Electron pick the first device', () => {
    const { contents, listenerFor } = fakeContents(() => Promise.resolve());
    guardContents(contents, { os: 'linux', devRun: false });
    const steps: string[] = [];
    listenerFor('select-bluetooth-device')(
      { preventDefault: () => steps.push('prevented') },
      [{ deviceId: 'speaker' }],
      (id: string) => steps.push(`chose ${JSON.stringify(id)}`),
    );
    expect(steps).toEqual(['prevented', 'chose ""']);
  });
});

describe('guardContents file chooser block', () => {
  // A dev run keeps reload and DevTools, but a file chooser is never the app's.
  it.each([false, true])('intercepts file choosers before the first load, dev run %s', (devRun) => {
    const { contents, debuggerCalls } = fakeContents(() => Promise.resolve());
    guardContents(contents, { os: 'linux', devRun });
    expect(debuggerCalls).toEqual(['attach', 'Page.enable', 'Page.setInterceptFileChooserDialog']);
  });
});

describe('guardContents zoom', () => {
  it('limits pinch zoom after the page loads, not before it has a frame', () => {
    const { contents, calls, emit } = fakeContents(() => Promise.resolve());
    guardContents(contents, { os: 'linux', devRun: false });
    expect(calls).toEqual([]);
    emit('did-finish-load');
    emit('did-finish-load');
    expect(calls).toEqual(['zoom limits 1 1', 'zoom limits 1 1']);
  });

  it('handles a rejected limit instead of leaving an unhandled rejection', async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args[0]);
    try {
      const { contents, emit } = fakeContents(() =>
        Promise.reject(new Error('Render frame was disposed before WebFrameMain could be accessed')),
      );
      guardContents(contents, { os: 'linux', devRun: false });
      emit('did-finish-load');
      await new Promise((resolve) => setImmediate(resolve));
      expect(errors).toEqual(['The pinch zoom limit did not apply.']);
    } finally {
      console.error = original;
    }
  });

  it('puts the page zoom back to 1 whenever it changes', () => {
    const { contents, calls, emit } = fakeContents(() => Promise.resolve());
    guardContents(contents, { os: 'linux', devRun: false });
    emit('zoom-changed');
    expect(calls).toEqual(['zoom factor 1']);
  });

  it('puts back the fitted zoom of a window smaller than the layout', () => {
    const { contents, calls, emit } = fakeContents(() => Promise.resolve());
    guardContents(contents, { os: 'linux', devRun: false, zoomFactor: () => 0.75 });
    emit('zoom-changed');
    expect(calls).toEqual(['zoom factor 0.75']);
  });
});
