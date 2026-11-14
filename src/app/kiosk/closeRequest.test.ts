import { describe, expect, it } from 'vitest';
import { createManualScheduler } from '../../core/activityKit/scheduler.ts';
import { createQuitFlow, QUIT_DEADLINE_MS } from './closeRequest.ts';
import { createQuitWorkRegistry } from './quitWork.ts';
import { appDocument, type Profile } from '../../core/storage/schemas.ts';
import { createSessionStore } from '../session/sessionStore.ts';
import { createFakeBridge } from '../session/testing/fakeBridge.ts';

const KID: Profile = { id: 'kid', avatarId: 'fox', colorId: 'sky', band: 'band-6-8' };

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The flow with a real work registry. The window and the parent gate are the I/O edge, and the
 * held work is a picture whose save the test controls.
 */
function harness({ gatePasses = true }: { gatePasses?: boolean } = {}) {
  const calls: string[] = [];
  const timers = createManualScheduler({ wall: 0 });
  const work = createQuitWorkRegistry();
  let sessionWrites = 0;
  const flow = createQuitFlow({
    window: {
      acknowledgeCloseRequest: async () => {
        calls.push('acknowledge');
      },
      quit: async () => {
        calls.push('quit');
      },
    },
    askParent: async (reason) => {
      calls.push(`gate ${reason}`);
      return gatePasses;
    },
    work,
    session: {
      flush: async () => {
        calls.push('session flush');
        sessionWrites = 0;
      },
      hasPendingWork: () => sessionWrites > 0,
    },
    setTimeout: (callback, ms) => timers.setTimeout(callback, ms),
  });

  /** An unsaved picture. Each finish resolves the way the test says, or hangs until it says. */
  function holdPicture(results: Array<boolean | 'hang'>) {
    let unsaved = true;
    return work.hold({
      pending: () => unsaved,
      finish: () => {
        const result = results.shift() ?? true;
        calls.push(`save ${String(result)}`);
        if (result === 'hang') return new Promise<boolean>(() => undefined);
        unsaved = !result;
        return Promise.resolve(result);
      },
    });
  }

  return {
    flow,
    calls,
    timers,
    holdPicture,
    queueSessionWrite: () => {
      sessionWrites++;
    },
  };
}

describe('quitting under kiosk lock', () => {
  it('acknowledges before asking, then saves the picture and the session before it quits', async () => {
    const { flow, calls, holdPicture } = harness();
    holdPicture([true]);
    expect(await flow.closeRequested({ kioskLock: true })).toBe(true);
    expect(calls).toEqual(['acknowledge', 'gate quit', 'save true', 'session flush', 'quit']);
  });

  it('stays open and saves nothing when the adult cancels the gate', async () => {
    const { flow, calls, holdPicture } = harness({ gatePasses: false });
    holdPicture([true]);
    expect(await flow.closeRequested({ kioskLock: true })).toBe(false);
    expect(calls).toEqual(['acknowledge', 'gate quit']);
  });
});

describe('closing the window without kiosk lock', () => {
  it('acknowledges at once, then saves the picture and the session and quits with no parent gate', async () => {
    const { flow, calls, holdPicture } = harness({ gatePasses: false });
    holdPicture([true]);
    expect(await flow.closeRequested({ kioskLock: false })).toBe(true);
    expect(calls).toEqual(['acknowledge', 'save true', 'session flush', 'quit']);
  });

  it('quits at once when nothing is unsaved', async () => {
    const { flow, calls } = harness({ gatePasses: false });
    expect(await flow.closeRequested({ kioskLock: false })).toBe(true);
    expect(calls).toEqual(['acknowledge', 'session flush', 'quit']);
  });

  it('lets the unload through once the close request is quitting, so the window can close', async () => {
    const { flow, holdPicture } = harness();
    holdPicture([true]);
    await flow.closeRequested({ kioskLock: false });
    expect(flow.unloadRequested()).toBe(false);
  });
});

describe('quitting with unsaved work', () => {
  it('stays open once when the picture could not be saved, and quits on the next try', async () => {
    const { flow, calls, holdPicture } = harness();
    holdPicture([false, false]);
    expect(await flow.quit()).toBe(false);
    expect(calls).not.toContain('quit');
    // The adult was told once. Closing again closes, even though the save fails again.
    expect(await flow.quit()).toBe(true);
    expect(calls).toEqual(['save false', 'session flush', 'save false', 'session flush', 'quit']);
  });

  it('quits once the deadline passes when a save hangs, so the app can always close', async () => {
    const { flow, calls, timers, holdPicture } = harness();
    holdPicture(['hang']);
    let quit: boolean | null = null;
    void flow.quit().then((result) => (quit = result));
    await settle();
    timers.advance(QUIT_DEADLINE_MS - 1);
    await settle();
    expect(quit).toBeNull();
    timers.advance(1);
    await settle();
    expect(quit).toBe(true);
    expect(calls).toEqual(['save hang', 'quit']);
  });

  it('quits at its own deadline while a profile removal waits for a list write that never ends', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const fake = createFakeBridge({
      documents: {
        app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true }),
        profiles: JSON.stringify({ version: 1, profiles: [KID] }),
      },
    });
    // The session's own deadlines never fire here: the removal must not need them to let go.
    const session = createSessionStore({ bridge: fake.bridge, timers: createManualScheduler({ wall: 0 }) });
    await session.start();
    fake.holdWrites();
    const removal = session.deleteProfile(KID.id);
    await fake.heldWritesReach(1);
    const calls: string[] = [];
    const flow = createQuitFlow({
      window: {
        acknowledgeCloseRequest: async () => undefined,
        quit: async () => {
          calls.push('quit');
        },
      },
      askParent: async () => true,
      work: createQuitWorkRegistry(),
      session,
      setTimeout: (callback, ms) => timers.setTimeout(callback, ms),
    });
    let quit: boolean | null = null;
    void flow.quit().then((result) => (quit = result));
    await settle();
    expect(quit).toBeNull();
    timers.advance(QUIT_DEADLINE_MS);
    await settle();
    expect(quit).toBe(true);
    expect(calls).toEqual(['quit']);
    // The removal is still waiting for its write: quitting decided nothing about it.
    let removed: unknown = null;
    void removal.then((result) => (removed = result));
    await settle();
    expect(removed).toBeNull();
  });

  it('runs one quit at a time when the adult closes twice quickly', async () => {
    const { flow, calls, holdPicture } = harness();
    holdPicture([true]);
    expect(await Promise.all([flow.quit(), flow.quit()])).toEqual([true, true]);
    expect(calls.filter((call) => call === 'quit')).toHaveLength(1);
  });
});

describe('a close without kiosk lock', () => {
  it('goes straight through when nothing is unsaved', () => {
    const { flow, calls } = harness();
    expect(flow.unloadRequested()).toBe(false);
    expect(calls).toEqual([]);
  });

  it('waits for an unsaved picture, saves it, quits, and then lets the window close', async () => {
    const { flow, calls, holdPicture } = harness();
    holdPicture([true]);
    expect(flow.unloadRequested()).toBe(true);
    await settle();
    expect(calls).toEqual(['save true', 'session flush', 'quit']);
    // Quitting closes the window again, and this time the page lets it go.
    expect(flow.unloadRequested()).toBe(false);
  });

  it('waits for a queued session write too', async () => {
    const { flow, calls, queueSessionWrite } = harness();
    queueSessionWrite();
    expect(flow.unloadRequested()).toBe(true);
    await settle();
    expect(calls).toEqual(['session flush', 'quit']);
  });

  it('keeps waiting while a quit is already saving, without starting a second one', async () => {
    const { flow, calls, timers, holdPicture } = harness();
    holdPicture(['hang']);
    expect(flow.unloadRequested()).toBe(true);
    expect(flow.unloadRequested()).toBe(true);
    timers.advance(QUIT_DEADLINE_MS);
    await settle();
    expect(calls).toEqual(['save hang', 'quit']);
  });
});

describe('the quit work registry', () => {
  it('finishes only pending work, treats a rejected finish as failed, and forgets released work', async () => {
    const work = createQuitWorkRegistry();
    const finished: string[] = [];
    work.hold({ pending: () => false, finish: async () => (finished.push('idle'), true) });
    const release = work.hold({ pending: () => true, finish: () => Promise.reject(new Error('worker gone')) });
    expect(work.pending()).toBe(true);
    expect(await work.finish()).toBe(false);
    expect(finished).toEqual([]);
    release();
    expect(work.pending()).toBe(false);
    expect(await work.finish()).toBe(true);
  });
});
