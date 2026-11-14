import { describe, expect, it } from 'vitest';
import { createSessionStore } from '../../../app/session/sessionStore.ts';
import { createFakeBridge } from '../../../app/session/testing/fakeBridge.ts';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface } from '../../../core/paint/surface.ts';
import round from '../../../core/paint/tips/round.ts';
import brush from '../../../core/paint/tools/brush/index.ts';
import { BridgeError } from '../../../core/platform/bridge.ts';
import { appDocument } from '../../../core/storage/schemas.ts';
import { PICTURE_CALL_DEADLINE_MS, boundedPictures } from '../boundedPictures.ts';
import { WORKER_DEADLINES, createEffectRunner, type WorkerLike } from '../worker/effectRunner.ts';
import { Autosaver, type AutosaveOptions, type EncodedPicture, type KeptPicture } from './autosave.ts';
import { StudioDocument } from './studioDocument.ts';

const PROFILE = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
const SIZE = 64;

const settle = () => new Promise((resolve) => setImmediate(resolve));
const noop = (): void => undefined;

/** The first pixel's red value, which each test paints differently, as the "file". */
function fakeEncode(studio: StudioDocument): Promise<EncodedPicture> {
  const png = new Uint8Array([studio.doc.paint.data[0] ?? 0]);
  return Promise.resolve({ png, thumbnail: png });
}

/** A whole-picture change in one red value, so a saved "file" shows which change it holds. */
function paintAll(studio: StudioDocument, red: number): void {
  studio.replacePaint(createSurface(SIZE, SIZE, rgba(red, 0, 0)).data);
}

/** A brush stroke that is still open: the pen is down. */
function openStroke(studio: StudioDocument): void {
  studio.begin(brush, { color: rgba(10, 200, 10), size: 8, tip: round, seed: 1 }, { x: 0, y: 0 });
  studio.move([{ x: 30, y: 30 }]);
}

/** The red value of every gallery picture, smallest first. */
async function reds(gallery: () => Promise<Array<{ red: number | undefined }>>): Promise<number[]> {
  return (await gallery()).map((picture) => picture.red ?? -1).toSorted((a, b) => a - b);
}

const blank = (): KeptPicture => ({ studio: new StudioDocument(SIZE, SIZE), id: null, savedVersion: 0 });

/**
 * The saver over a real session store and a fake bridge, the I/O edge. `failSaves` makes the
 * bridge reject picture saves, as a full disk would.
 */
async function setup(picture: KeptPicture = blank(), overrides: Partial<AutosaveOptions> = {}) {
  const fake = createFakeBridge({
    documents: {
      app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: PROFILE.id }),
      profiles: JSON.stringify({ version: 1, profiles: [PROFILE] }),
    },
  });
  const store = createSessionStore({ bridge: fake.bridge });
  await store.start();
  const pictures = store.pictures();
  const timers = createManualScheduler({ wall: 0 });
  const failing: boolean[] = [];
  let failSaves: Error | null = null;
  const bridgeSave = fake.bridge.pictures.save.bind(fake.bridge.pictures);
  fake.bridge.pictures.save = (profileId, input) =>
    failSaves === null ? bridgeSave(profileId, input) : Promise.reject(failSaves);
  const saver = new Autosaver(
    {
      scope: createScope(timers),
      delayMs: 1500,
      encode: fakeEncode,
      save: pictures.save,
      onFailingChange: (now) => failing.push(now),
      ...overrides,
    },
    picture,
  );
  const gallery = async () => {
    const listed = await pictures.list('gallery');
    if (!listed.ok) throw listed.error;
    return Promise.all(
      listed.value.map(async ({ id }) => {
        const read = await pictures.read(id, 'picture');
        if (!read.ok) throw read.error;
        return { id, red: read.value[0] };
      }),
    );
  };
  return {
    saver,
    timers,
    store,
    gallery,
    failing,
    failSaves: (error: Error | null) => {
      failSaves = error;
    },
  };
}

describe('Autosaver', () => {
  it('saves after painting pauses, creating the picture first and overwriting it after', async () => {
    const picture = blank();
    const { saver, timers, gallery } = await setup(picture);
    paintAll(picture.studio, 7);
    paintAll(picture.studio, 8);
    // Only one timer waits: each change restarts the pause.
    expect(timers.pending()).toBe(1);
    expect(await gallery()).toEqual([]);
    timers.advance(1500);
    await settle();
    expect(await gallery()).toEqual([{ id: saver.pictureId, red: 8 }]);
    expect(saver.pictureId).not.toBeNull();

    paintAll(picture.studio, 9);
    expect(await saver.keep()).toBe(true);
    expect(await gallery()).toEqual([{ id: saver.pictureId, red: 9 }]);
    expect(saver.hasUnsavedChanges).toBe(false);
  });

  it('saves a picture opened from the gallery only after it changes', async () => {
    const studio = new StudioDocument(SIZE, SIZE);
    const { saver, timers, gallery } = await setup({ studio, id: 'from-gallery', savedVersion: studio.version });
    expect(timers.pending()).toBe(0);
    expect(await saver.keep()).toBe(true);
    expect(await gallery()).toEqual([]);
  });

  it('saves a starting picture at once as new work', async () => {
    const studio = new StudioDocument(SIZE, SIZE);
    paintAll(studio, 40);
    const { saver, timers, gallery } = await setup({ studio, id: null, savedVersion: 0 });
    expect(saver.hasUnsavedChanges).toBe(true);
    timers.advance(1500);
    await settle();
    expect(await gallery()).toEqual([{ id: saver.pictureId, red: 40 }]);
  });

  it('commits and saves a stroke still open when the picture is kept', async () => {
    const picture = blank();
    const { saver, gallery } = await setup(picture);
    openStroke(picture.studio);
    // The open stroke has not counted as a version yet, but it is unsaved work.
    expect(picture.studio.version).toBe(0);
    expect(saver.hasUnsavedChanges).toBe(true);
    expect(await saver.keep()).toBe(true);
    expect(picture.studio.stroking).toBe(false);
    expect(await gallery()).toHaveLength(1);
  });

  it('keeps counting a whole-picture change as unsaved after the undo history is full', async () => {
    const studio = new StudioDocument(SIZE, SIZE, { maxSteps: 2 });
    const { saver, gallery } = await setup({ studio, id: null, savedVersion: 0 });
    for (let red = 1; red <= 5; red++) {
      paintAll(studio, red);
      expect(saver.hasUnsavedChanges).toBe(true);
      expect(await saver.keep()).toBe(true);
    }
    expect(await gallery()).toEqual([{ id: saver.pictureId, red: 5 }]);
  });

  it('saves a change made during a save right after it, from the same keep, never two at once', async () => {
    const picture = blank();
    let release: () => void = noop;
    let held = 0;
    const order: string[] = [];
    const { saver, gallery, store } = await setup(picture, {
      encode: async (studio) => {
        const files = await fakeEncode(studio);
        order.push(`encode ${String(files.png[0])}`);
        if (held++ === 0) await new Promise<void>((resolve) => (release = resolve));
        return files;
      },
    });
    paintAll(picture.studio, 1);
    const kept = saver.keep();
    await settle();
    paintAll(picture.studio, 2);
    const again = saver.flush();
    release();
    expect(await kept).toBe(true);
    expect(await again).toBe(true);
    await store.flush();
    expect(order).toEqual(['encode 1', 'encode 2']);
    expect(await gallery()).toEqual([{ id: saver.pictureId, red: 2 }]);
  });

  it('switches pictures only after the old one saved, and both end up in the gallery', async () => {
    const first = blank();
    const { saver, gallery } = await setup(first);
    paintAll(first.studio, 11);
    const second = blank();
    expect(await saver.switchTo(second)).toBe(true);
    expect(saver.studio).toBe(second.studio);
    paintAll(second.studio, 22);
    expect(await saver.keep()).toBe(true);
    expect(await reds(gallery)).toEqual([11, 22]);
  });

  it('saves every picture when two switches race', async () => {
    const first = blank();
    const { saver, gallery } = await setup(first);
    paintAll(first.studio, 11);
    const second = blank();
    paintAll(second.studio, 22);
    const third = blank();
    const results = await Promise.all([saver.switchTo(second), saver.switchTo(third)]);
    expect(results).toEqual([true, true]);
    expect(saver.studio).toBe(third.studio);
    expect(await reds(gallery)).toEqual([11, 22]);
  });

  describe('when saving fails', () => {
    it('keeps the picture and its changes, says so once, and saves them when saving works again', async () => {
      const picture = blank();
      const { saver, gallery, failing, failSaves, store } = await setup(picture);
      failSaves(new BridgeError('io', 'disk full'));
      paintAll(picture.studio, 5);
      expect(await saver.keep()).toBe(false);
      expect(await saver.keep()).toBe(false);
      expect(saver.hasUnsavedChanges).toBe(true);
      expect(saver.failing).toBe(true);
      expect(failing).toEqual([true]);
      expect(store.getSnapshot().saveProblem).toMatchObject({ operation: 'save-picture', code: 'io' });
      expect(await gallery()).toEqual([]);

      failSaves(null);
      expect(await saver.keep()).toBe(true);
      expect(failing).toEqual([true, false]);
      expect(await gallery()).toEqual([{ id: saver.pictureId, red: 5 }]);
    });

    it('refuses to switch and keeps holding the unsaved picture', async () => {
      const first = blank();
      const { saver, failSaves, gallery } = await setup(first);
      failSaves(new BridgeError('io', 'disk full'));
      paintAll(first.studio, 5);
      const second = blank();
      expect(await saver.switchTo(second)).toBe(false);
      expect(saver.studio).toBe(first.studio);
      expect(saver.hasUnsavedChanges).toBe(true);

      failSaves(null);
      expect(await saver.switchTo(second)).toBe(true);
      expect(await gallery()).toEqual([{ id: expect.any(String), red: 5 }]);
    });

    it('treats a save call that throws as a failed save, so leaving never sticks', async () => {
      const picture = blank();
      const { saver, failing } = await setup(picture, {
        save: () => Promise.reject(new Error('the bridge went away')),
      });
      paintAll(picture.studio, 3);
      expect(await saver.keep()).toBe(false);
      expect(failing).toEqual([true]);
      expect(saver.hasUnsavedChanges).toBe(true);
    });

    it('treats a picture it cannot encode as unsaved, without throwing', async () => {
      const picture = blank();
      let broken = true;
      const { saver, gallery } = await setup(picture, {
        encode: (studio) => (broken ? Promise.reject(new Error('no canvas')) : fakeEncode(studio)),
      });
      paintAll(picture.studio, 3);
      expect(await saver.keep()).toBe(false);
      expect(saver.hasUnsavedChanges).toBe(true);
      broken = false;
      expect(await saver.keep()).toBe(true);
      expect(await gallery()).toEqual([{ id: saver.pictureId, red: 3 }]);
    });
  });

  it('stops waiting to save once disposed, and once the scope is disposed', async () => {
    for (const stop of ['saver', 'scope'] as const) {
      const timers = createManualScheduler({ wall: 0 });
      const scope = createScope(timers);
      const picture = blank();
      const saver = new Autosaver(
        {
          scope,
          delayMs: 10,
          encode: () => Promise.reject(new Error('must not encode')),
          save: () => Promise.reject(new Error('must not save')),
        },
        picture,
      );
      paintAll(picture.studio, 1);
      expect(timers.pending()).toBe(1);
      if (stop === 'saver') saver.dispose();
      else scope.dispose();
      expect(timers.pending()).toBe(0);
      paintAll(picture.studio, 2);
      expect(timers.pending()).toBe(0);
      await settle();
    }
  });
});

/**
 * The studio's whole save chain without the screen: the real effect runner encodes, and the
 * real session store saves through bounded calls. Only the worker, this thread's encoder, and the
 * bridge are fakes, and each can be made to never answer. This is what the route blocker awaits.
 */
async function chain(options: { worker: 'silent' | 'none'; encodeHere: 'works' | 'hangs'; bridge: 'works' | 'hangs' }) {
  const fake = createFakeBridge({
    documents: {
      app: JSON.stringify({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: PROFILE.id }),
      profiles: JSON.stringify({ version: 1, profiles: [PROFILE] }),
    },
  });
  if (options.bridge === 'hangs') fake.bridge.pictures.save = () => new Promise(() => undefined);
  const store = createSessionStore({ bridge: fake.bridge });
  await store.start();
  const realTime = createManualScheduler({ wall: 0 });
  const pictures = boundedPictures(store.pictures(), realTime);
  const silentWorker: WorkerLike = {
    postMessage: noop,
    addEventListener: noop,
    terminate: noop,
  };
  const runner = createEffectRunner(
    () => (options.worker === 'silent' ? silentWorker : null),
    (doc) =>
      options.encodeHere === 'hangs'
        ? new Promise(() => undefined)
        : Promise.resolve({ png: new Uint8Array([doc.paint.data[0] ?? 0]), thumbnail: new Uint8Array([1]) }),
    realTime,
  );
  const failing: boolean[] = [];
  const picture = blank();
  const saver = new Autosaver(
    {
      scope: createScope(createManualScheduler({ wall: 0 })),
      delayMs: 1500,
      encode: (owner) => runner.encode(owner.doc, owner.pageId),
      save: pictures.save,
      onFailingChange: (now) => failing.push(now),
    },
    picture,
  );
  /** Moves real time on in steps, letting each step's promises run, as the event loop would. */
  const wait = async (ms: number): Promise<void> => {
    for (let passed = 0; passed < ms; passed += 1000) {
      await settle();
      realTime.advance(1000);
    }
    await settle();
  };
  return { saver, picture, failing, wait, pictures };
}

describe('a save whose worker or main process never answers', () => {
  it('saves through this thread once the worker misses its deadline', async () => {
    const { saver, picture, failing, wait, pictures } = await chain({
      worker: 'silent',
      encodeHere: 'works',
      bridge: 'works',
    });
    paintAll(picture.studio, 6);
    const kept = saver.keep();
    await wait(WORKER_DEADLINES.encode);
    expect(await kept).toBe(true);
    expect(failing).toEqual([]);
    const listed = await pictures.list('gallery');
    if (!listed.ok) throw listed.error;
    const read = await pictures.read(listed.value[0]?.id ?? '', 'picture');
    expect(read.ok && [...read.value]).toEqual([6]);
  });

  it.each([
    {
      worker: 'silent',
      encodeHere: 'hangs',
      bridge: 'works',
      within: WORKER_DEADLINES.encode + WORKER_DEADLINES.encodeHere,
    },
    { worker: 'none', encodeHere: 'works', bridge: 'hangs', within: PICTURE_CALL_DEADLINE_MS },
  ] as const)(
    'gives up and keeps the picture when the worker is $worker, this thread $encodeHere, and the bridge $bridge',
    async (options) => {
      const { saver, picture, failing, wait } = await chain(options);
      paintAll(picture.studio, 6);
      let outcome: boolean | 'waiting' = 'waiting';
      void saver.keep().then((kept) => (outcome = kept));
      await wait(options.within - 1000);
      expect(outcome).toBe('waiting');
      await wait(1000);
      // The screen releases input and says the picture is not saved yet when keep ends false.
      expect(outcome).toBe(false);
      expect(failing).toEqual([true]);
      expect(saver.studio).toBe(picture.studio);
      expect(saver.hasUnsavedChanges).toBe(true);
    },
  );
});
