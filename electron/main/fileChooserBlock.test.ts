import { describe, expect, it, vi } from 'vitest';
import { blockFileChoosers, type ChooserDebugger } from './fileChooserBlock.ts';

const INTERCEPT = ['Page.setInterceptFileChooserDialog', { enabled: true, cancel: true }];

/** Electron's in-process debugger, recording what the block asks of it. */
function fakeDebugger(options: { attachThrows?: boolean; failCommand?: string; hangCommands?: boolean } = {}) {
  const calls: unknown[] = [];
  let attached = false;
  let onDetach: ((event: unknown, reason: string) => void) | undefined;
  const debug: ChooserDebugger = {
    attach() {
      if (options.attachThrows === true) throw new Error('Another debugger is already attached.');
      attached = true;
      calls.push('attach');
    },
    isAttached: () => attached,
    sendCommand(method, params) {
      calls.push(params === undefined ? [method] : [method, params]);
      if (options.hangCommands === true) return new Promise(() => undefined);
      return method === options.failCommand ? Promise.reject(new Error('target closed')) : Promise.resolve({});
    },
    on(event, listener) {
      if (event !== 'detach') throw new Error(`Unexpected event ${event as string}`);
      onDetach = listener;
    },
  };
  const detach = (reason: string) => {
    attached = false;
    onDetach?.({}, reason);
  };
  return { debug, calls, detach };
}

/** Lets the block's deferred check run. */
const nextTask = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('blockFileChoosers', () => {
  it('attaches, turns the Page domain on, then intercepts and cancels every chooser', () => {
    const { debug, calls } = fakeDebugger();
    blockFileChoosers(debug, () => false);
    // Interception without the Page domain lets the chooser open, so the order matters.
    expect(calls).toEqual(['attach', ['Page.enable'], INTERCEPT]);
  });

  // Electron says "target closed" both when its own session is detached while the page lives and
  // when the web contents is closing, and the web contents reports destroyed only a step later.
  it.each(['target closed', 'canceled by client'])(
    'turns the block back on after a %s detach while the web contents lives',
    async (reason) => {
      const { debug, calls, detach } = fakeDebugger();
      blockFileChoosers(debug, () => false);
      calls.length = 0;
      detach(reason);
      expect(calls).toEqual([]);
      await nextTask();
      expect(calls).toEqual(['attach', ['Page.enable'], INTERCEPT]);
    },
  );

  it('stays off when the web contents is destroyed by the time it would turn back on', async () => {
    const { debug, calls, detach } = fakeDebugger();
    let destroyed = false;
    blockFileChoosers(debug, () => destroyed);
    calls.length = 0;
    detach('target closed');
    destroyed = true;
    await nextTask();
    expect(calls).toEqual([]);
  });

  it('reports a debugger it cannot attach instead of throwing', () => {
    const reports: string[] = [];
    const { debug, calls } = fakeDebugger({ attachThrows: true });
    blockFileChoosers(
      debug,
      () => false,
      (message) => reports.push(message),
    );
    expect(calls).toEqual([]);
    expect(reports).toEqual(['The file chooser block could not attach.']);
  });

  it('reports a command that fails', async () => {
    const reports: string[] = [];
    const { debug } = fakeDebugger({ failCommand: 'Page.setInterceptFileChooserDialog' });
    blockFileChoosers(
      debug,
      () => false,
      (message) => reports.push(message),
    );
    await expect.poll(() => reports).toEqual(['The file chooser block failed at Page.setInterceptFileChooserDialog.']);
  });

  it('stops reattaching after repeated consecutive detaches', () => {
    vi.useFakeTimers();
    try {
      const reports: string[] = [];
      const { debug, calls, detach } = fakeDebugger({ hangCommands: true });
      blockFileChoosers(
        debug,
        () => false,
        (message) => reports.push(message),
      );
      calls.length = 0;

      // Drive 8 consecutive detach -> retry cycles while commands never finish.
      for (let attempt = 1; attempt <= 8; attempt++) {
        detach('target closed');
        vi.runOnlyPendingTimers();
        expect(calls.filter((call) => call === 'attach')).toHaveLength(attempt);
      }
      expect(reports).toEqual([]);

      // The 9th consecutive detach hits the retry cap, reports the loop, and stops reattaching.
      calls.length = 0;
      detach('target closed');
      vi.runAllTimers();
      expect(calls).toEqual([]);
      expect(reports).toEqual(['The file chooser block stopped reattaching after repeated detaches.']);
    } finally {
      vi.useRealTimers();
    }
  });
});
