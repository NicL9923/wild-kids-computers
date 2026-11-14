import { describe, expect, it } from 'vitest';
import { guardContents, type GuardedContents } from './contentsGuard.ts';
import type { KeyInput } from './shortcuts.ts';

type Listener = (event: { preventDefault(): void }, input: KeyInput) => void;

const NO_EVENT = { preventDefault: () => undefined };
const NO_KEY: KeyInput = { key: '', code: '', control: false, meta: false, alt: false, shift: false };

/** A web contents that records listeners and calls. Anything the guard does not use throws. */
function fakeContents(zoomLimits: () => Promise<void>) {
  const listeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  const contents: GuardedContents = {
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
    for (const listener of listeners.get(event) ?? []) listener(NO_EVENT, NO_KEY);
  };
  return { contents, calls, emit };
}

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
});
