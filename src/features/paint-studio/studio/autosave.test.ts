import { describe, expect, it } from 'vitest';
import { BridgeError, type PictureSummary, type SavePictureInput } from '../../../core/platform/bridge.ts';
import type { BridgeResult } from '../../../app/session/sessionStore.ts';
import { createStudioScope, type TimerHost } from '../studioScope.ts';
import { Autosaver, type EncodedPicture } from './autosave.ts';

/** Timers that run only when the test says so. */
function manualTimers(): TimerHost & { runAll: () => void; pending: () => number } {
  let next = 1;
  const timers = new Map<number, () => void>();
  return {
    setTimeout: (callback) => {
      const id = next++;
      timers.set(id, callback);
      return () => timers.delete(id);
    },
    setInterval: () => {
      throw new Error('not used');
    },
    requestAnimationFrame: () => {
      throw new Error('not used');
    },
    runAll: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) callback();
    },
    pending: () => timers.size,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function setup(results: BridgeResult<PictureSummary>[] = []) {
  const timers = manualTimers();
  const saves: SavePictureInput[] = [];
  let pixel = 0;
  let release: (() => void) | null = null;
  const options = {
    scope: createStudioScope(timers),
    delayMs: 1500,
    encode: (): Promise<EncodedPicture> => {
      const png = new Uint8Array([pixel]);
      return Promise.resolve({ png, thumbnail: png });
    },
    save: async (input: SavePictureInput): Promise<BridgeResult<PictureSummary>> => {
      saves.push(input);
      if (release === null && holdNext) {
        holdNext = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        release = null;
      }
      return results.shift() ?? { ok: true, value: { id: input.id ?? 'pic-1', updatedAt: 1 } };
    },
  };
  let holdNext = false;
  return {
    saver: new Autosaver(options),
    timers,
    saves,
    paint: (value: number) => {
      pixel = value;
    },
    holdNextSave: () => {
      holdNext = true;
    },
    releaseSave: () => release?.(),
  };
}

describe('Autosaver', () => {
  it('saves after painting pauses, creating the picture first and overwriting it after', async () => {
    const { saver, timers, saves, paint } = setup();
    paint(7);
    saver.changed(1);
    saver.changed(2);
    // Only one timer waits: each change restarts the pause.
    expect(timers.pending()).toBe(1);
    expect(saves).toHaveLength(0);
    timers.runAll();
    await settle();
    expect(saves).toEqual([{ png: new Uint8Array([7]), thumbnail: new Uint8Array([7]) }]);
    expect(saver.pictureId).toBe('pic-1');

    paint(9);
    saver.changed(3);
    await saver.flush();
    expect(saves[1]?.id).toBe('pic-1');
    expect([...(saves[1]?.png ?? [])]).toEqual([9]);
    expect(saver.hasUnsavedChanges).toBe(false);
  });

  it('does nothing when nothing changed since the last save', async () => {
    const { saver, timers, saves } = setup();
    saver.changed(0);
    expect(timers.pending()).toBe(0);
    await saver.flush();
    expect(saves).toHaveLength(0);
  });

  it('saves a change made during a save right after it, never two at once', async () => {
    const { saver, saves, paint, holdNextSave, releaseSave } = setup();
    holdNextSave();
    paint(1);
    saver.changed(1);
    const first = saver.flush();
    await settle();
    paint(2);
    saver.changed(2);
    const second = saver.flush();
    await settle();
    expect(saves).toHaveLength(1);
    releaseSave();
    await Promise.all([first, second]);
    expect(saves.map((save) => [...save.png])).toEqual([[1], [2]]);
    expect(saves[1]?.id).toBe('pic-1');
  });

  it('keeps the picture unsaved after a failed save and tries again on the next flush', async () => {
    const failure: BridgeResult<PictureSummary> = { ok: false, error: new BridgeError('io', 'disk full') };
    const { saver, saves } = setup([failure]);
    saver.changed(1);
    await saver.flush();
    expect(saves).toHaveLength(1);
    expect(saver.hasUnsavedChanges).toBe(true);
    expect(saver.pictureId).toBeNull();
    await saver.flush();
    expect(saves).toHaveLength(2);
    expect(saver.hasUnsavedChanges).toBe(false);
  });

  it('stops waiting to save once the scope is disposed', async () => {
    const timers = manualTimers();
    const scope = createStudioScope(timers);
    const saver = new Autosaver({
      scope,
      delayMs: 10,
      encode: () => Promise.reject(new Error('must not encode')),
      save: () => Promise.reject(new Error('must not save')),
    });
    saver.changed(1);
    scope.dispose();
    expect(timers.pending()).toBe(0);
    await settle();
  });

  it('saves a change made during a save right after it, from the same flush', async () => {
    const { saver, saves, paint, holdNextSave, releaseSave, timers } = setup();
    holdNextSave();
    paint(1);
    saver.changed(1);
    const flushing = saver.flush();
    await settle();
    paint(2);
    saver.changed(2);
    releaseSave();
    await flushing;
    expect(saves.map((save) => [...save.png])).toEqual([[1], [2]]);
    // The flush took care of the change, so the waiting timer was cancelled.
    expect(timers.pending()).toBe(0);
  });

  it('cancels the waiting timer when a flush saves first', async () => {
    const { saver, timers, saves } = setup();
    saver.changed(1);
    expect(timers.pending()).toBe(1);
    await saver.flush();
    expect(timers.pending()).toBe(0);
    expect(saves).toHaveLength(1);
  });

  it('keeps the picture unsaved when it cannot be encoded, without throwing', async () => {
    const timers = manualTimers();
    let fail = true;
    const saves: SavePictureInput[] = [];
    const saver = new Autosaver({
      scope: createStudioScope(timers),
      delayMs: 10,
      encode: () =>
        fail
          ? Promise.reject(new Error('no canvas'))
          : Promise.resolve({ png: new Uint8Array([1]), thumbnail: new Uint8Array([1]) }),
      save: (input) => {
        saves.push(input);
        return Promise.resolve({ ok: true, value: { id: 'pic-9', updatedAt: 1 } });
      },
    });
    saver.changed(1);
    await saver.flush();
    expect(saves).toHaveLength(0);
    expect(saver.hasUnsavedChanges).toBe(true);
    fail = false;
    await saver.flush();
    expect(saver.pictureId).toBe('pic-9');
  });
});
