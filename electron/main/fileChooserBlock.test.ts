import { describe, expect, it } from 'vitest';
import { blockFileChoosers, type ChooserDebugger } from './fileChooserBlock.ts';

const INTERCEPT = ['Page.setInterceptFileChooserDialog', { enabled: true, cancel: true }];

/** Electron's in-process debugger, recording what the block asks of it. */
function fakeDebugger(options: { attachThrows?: boolean; failCommand?: string } = {}) {
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

describe('blockFileChoosers', () => {
  it('attaches, turns the Page domain on, then intercepts and cancels every chooser', () => {
    const { debug, calls } = fakeDebugger();
    blockFileChoosers(debug, () => false);
    // Interception without the Page domain lets the chooser open, so the order matters.
    expect(calls).toEqual(['attach', ['Page.enable'], INTERCEPT]);
  });

  it('turns the block back on after an unexpected detach', () => {
    const { debug, calls, detach } = fakeDebugger();
    blockFileChoosers(debug, () => false);
    calls.length = 0;
    detach('canceled by client');
    expect(calls).toEqual(['attach', ['Page.enable'], INTERCEPT]);
  });

  it.each([
    ['the web contents closed', 'target closed', false],
    ['the web contents is destroyed', 'canceled by client', true],
  ])('stays off when %s', (_label, reason, destroyed) => {
    const { debug, calls, detach } = fakeDebugger();
    blockFileChoosers(debug, () => destroyed);
    calls.length = 0;
    detach(reason);
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
});
