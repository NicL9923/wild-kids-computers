import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface, surfaceFromData } from '../../../core/paint/surface.ts';
import type { PictureEffect } from '../../../core/paint/types.ts';
import { paintEffects } from '../../../registry/paint.ts';
import { DeadlineError } from '../../../core/activityKit/deadline.ts';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import {
  WORKER_DEADLINES,
  createEffectRunner as createRunner,
  startEffectWorker,
  type WorkerLike,
} from './effectRunner.ts';
import type { EffectRequest, EffectResponse } from './protocol.ts';

/** Real-time timers for a test that never waits on a deadline. A test that does passes its own. */
const createEffectRunner = (
  makeWorker: Parameters<typeof createRunner>[0],
  encodeHere: Parameters<typeof createRunner>[1],
) => createRunner(makeWorker, encodeHere, createManualScheduler({ wall: 0 }));

const flip = paintEffects.find((effect): effect is PictureEffect => effect.id === 'flipSideways');
if (flip === undefined) throw new Error('The flipSideways effect is missing.');

/** A picture whose left column is red and the rest white. */
function picture() {
  const surface = createSurface(4, 2, rgba(255, 255, 255));
  for (let y = 0; y < 2; y++) surface.data.set([255, 0, 0, 255], y * 16);
  return surface;
}

/** A worker that answers in a later task, the way a real one does, and records what it got. */
function fakeWorker(answer: (request: EffectRequest) => EffectResponse | 'crash') {
  const received: EffectRequest[] = [];
  const transfers: Transferable[][] = [];
  const listeners: { message: ((event: MessageEvent<EffectResponse>) => void)[]; error: ((event: Event) => void)[] } = {
    message: [],
    error: [],
  };
  let terminated = false;
  const worker: WorkerLike = {
    postMessage(message, transfer) {
      received.push(message);
      transfers.push(transfer);
      setImmediate(() => {
        const response = answer(message);
        if (response === 'crash') for (const listener of listeners.error) listener(new Event('error'));
        else for (const listener of listeners.message) listener(new MessageEvent('message', { data: response }));
      });
    },
    addEventListener(type: 'message' | 'error', listener: never) {
      listeners[type].push(listener);
    },
    terminate() {
      terminated = true;
    },
  };
  return { worker, received, transfers, terminated: () => terminated };
}

function applyInFake(request: EffectRequest): EffectResponse {
  if (request.kind === 'warm') return { kind: 'ready', id: request.id };
  if (request.kind === 'encode') {
    // Stands in for the PNG files: the first paint byte, and whether a mask and page id came along.
    const marker = [request.paint[0] ?? 0, request.mask === null ? 0 : 1, request.pageId === null ? 0 : 1];
    return { kind: 'encoded', id: request.id, png: new Uint8Array(marker), thumbnail: new Uint8Array([9]) };
  }
  const source = surfaceFromData(request.width, request.height, request.pixels);
  const target = surfaceFromData(request.width, request.height, request.pixels);
  flip?.apply(source, target);
  return { kind: 'result', id: request.id, pixels: target.data };
}

/** Effect tests never encode; a call is a bug in the test. */
const noEncoding = (): Promise<never> => Promise.reject(new Error('This test does not encode pictures.'));

describe('effect runner', () => {
  it('sends a copy of the pixels to the worker and returns its result, leaving the source alone', async () => {
    const fake = fakeWorker(applyInFake);
    const runner = createEffectRunner(() => fake.worker, noEncoding);
    await runner.warm();
    const source = picture();
    const result = await runner.run(flip, source);
    expect(fake.received.map((request) => request.kind)).toEqual(['warm', 'apply']);
    expect(fake.received[1]).toMatchObject({ effectId: 'flipSideways', width: 4, height: 2 });
    // The red column moved to the right edge, and the source still has it on the left.
    expect([...result.subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect([...source.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('applies the effect on this thread when the worker reports an error', async () => {
    const fake = fakeWorker((request) =>
      request.kind === 'warm' ? { kind: 'ready', id: request.id } : { kind: 'error', id: request.id, message: 'no' },
    );
    const result = await createEffectRunner(() => fake.worker, noEncoding).run(flip, picture());
    expect([...result.subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  });

  it('falls back for good when the worker crashes or cannot start', async () => {
    const crashing = fakeWorker(() => 'crash');
    const runner = createEffectRunner(() => crashing.worker, noEncoding);
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(crashing.terminated()).toBe(true);
    await runner.run(flip, picture());
    expect(crashing.received).toHaveLength(1);

    let attempts = 0;
    const none = createEffectRunner(() => {
      attempts++;
      return null;
    }, noEncoding);
    expect([...(await none.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    await none.run(flip, picture());
    // It does not keep trying to start a worker that cannot start.
    expect(attempts).toBe(1);
    none.dispose();
  });

  it('starts one worker and sends each effect its own copy of the pixels, which it hands over', async () => {
    const fake = fakeWorker(applyInFake);
    let started = 0;
    const runner = createEffectRunner(() => {
      started++;
      return fake.worker;
    }, noEncoding);
    await runner.warm();
    const source = picture();
    await runner.run(flip, source);
    await runner.run(flip, source);
    expect(started).toBe(1);
    expect(fake.transfers[0]).toEqual([]);
    const sent = fake.received[1];
    if (sent?.kind !== 'apply') throw new Error('Expected an apply request.');
    expect(sent.pixels).not.toBe(source.data);
    expect(fake.transfers[1]).toEqual([sent.pixels.buffer]);
    expect(new Set(fake.received.map((request) => request.id)).size).toBe(3);
  });

  it('stops the worker when the studio closes and applies later effects on this thread', async () => {
    const fake = fakeWorker(applyInFake);
    const runner = createEffectRunner(() => fake.worker, noEncoding);
    await runner.warm();
    runner.dispose();
    expect(fake.terminated()).toBe(true);
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(fake.received).toHaveLength(1);
  });

  it('applies effects on this thread when making the worker throws', async () => {
    const runner = createEffectRunner(() => {
      throw new Error('workers are off');
    }, noEncoding);
    await runner.warm();
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  });

  it('has no worker to start outside a browser', () => {
    expect(startEffectWorker()).toBeNull();
  });
});

/** This thread's encoder, which marks its files so a test can tell them from the worker's. */
const encodeHere = (): Promise<{ png: Uint8Array; thumbnail: Uint8Array }> =>
  Promise.resolve({ png: new Uint8Array([7, 7]), thumbnail: new Uint8Array([7]) });

describe('encoding a picture for the gallery', () => {
  const page = { width: 4, height: 2 };

  it('encodes in the worker from a copy taken at once, so painting on afterwards changes nothing', async () => {
    const fake = fakeWorker(applyInFake);
    const runner = createEffectRunner(() => fake.worker, encodeHere);
    const paint = picture();
    const mask = createSurface(4, 2, rgba(0, 0, 0, 0));
    const encoding = runner.encode({ ...page, paint, mask }, 'meadow');
    paint.data[0] = 1;
    const files = await encoding;
    expect([...files.png]).toEqual([255, 1, 1]);
    expect([...files.thumbnail]).toEqual([9]);
    const sent = fake.received[0];
    if (sent?.kind !== 'encode') throw new Error('Expected an encode request.');
    expect(sent).toMatchObject({ width: 4, height: 2, pageId: 'meadow' });
    // Both copies are handed over, not copied again.
    expect(fake.transfers[0]).toEqual([sent.paint.buffer, sent.mask?.buffer]);
  });

  it('sends no mask for a plain picture', async () => {
    const fake = fakeWorker(applyInFake);
    const files = await createEffectRunner(() => fake.worker, encodeHere).encode(
      { ...page, paint: picture(), mask: null },
      null,
    );
    expect([...files.png]).toEqual([255, 0, 0]);
  });

  it('encodes on this thread when the worker reports an error or cannot start', async () => {
    const failing = fakeWorker((request) => ({ kind: 'error', id: request.id, message: 'no' }));
    const doc = { ...page, paint: picture(), mask: null };
    expect([...(await createEffectRunner(() => failing.worker, encodeHere).encode(doc, null)).png]).toEqual([7, 7]);
    expect([...(await createEffectRunner(() => null, encodeHere).encode(doc, null)).png]).toEqual([7, 7]);
  });
});

/**
 * A worker that answers only when the test says, the way a stuck or slow one behaves. Posting to it
 * after it was stopped throws, because the runner must never use a stopped worker.
 */
function heldWorker(autoWarm = true) {
  const received: EffectRequest[] = [];
  const listeners: { message: ((event: MessageEvent<EffectResponse>) => void)[]; error: ((event: Event) => void)[] } = {
    message: [],
    error: [],
  };
  let terminated = false;
  const worker: WorkerLike = {
    postMessage(message) {
      if (terminated) throw new Error('Posted to a stopped worker.');
      received.push(message);
      if (autoWarm && message.kind === 'warm') queueMicrotask(() => answer({ kind: 'ready', id: message.id }));
    },
    addEventListener(type: 'message' | 'error', listener: never) {
      listeners[type].push(listener);
    },
    terminate() {
      terminated = true;
    },
  };
  function answer(response: EffectResponse): void {
    for (const listener of listeners.message) listener(new MessageEvent('message', { data: response }));
  }
  return {
    worker,
    received,
    answer,
    crash: () => {
      for (const listener of listeners.error) listener(new Event('error'));
    },
    terminated: () => terminated,
  };
}

/** Lets settled promises run their callbacks. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Whether a promise settled yet. */
function track<T>(promise: Promise<T>): { readonly settled: boolean } {
  const state = { settled: false };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

describe('a worker that does not answer in time', () => {
  const page = { width: 4, height: 2 };

  it('encodes on this thread once the deadline passes, and the next request gets a fresh worker', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const workers = [heldWorker(), heldWorker()];
    let started = 0;
    const runner = createRunner(() => workers[started++]?.worker ?? null, encodeHere, timers);
    await runner.warm();

    const encoding = runner.encode({ ...page, paint: picture(), mask: null }, null);
    const state = track(encoding);
    timers.advance(WORKER_DEADLINES.encode - 1);
    await flush();
    expect(state.settled).toBe(false);
    timers.advance(1);
    expect([...(await encoding).png]).toEqual([7, 7]);
    expect(workers[0]?.terminated()).toBe(true);

    // The next effect starts a new worker, and its answer counts.
    const running = runner.run(flip, picture());
    await flush();
    const sent = workers[1]?.received[0];
    if (sent?.kind !== 'apply') throw new Error('Expected the fresh worker to get the effect.');
    workers[1]?.answer({ kind: 'result', id: sent.id, pixels: new Uint8ClampedArray(32).fill(3) });
    expect([...(await running).subarray(0, 4)]).toEqual([3, 3, 3, 3]);
    expect(started).toBe(2);
  });

  it('applies an effect on this thread when the worker holds it past the deadline', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const held = heldWorker();
    const runner = createRunner(() => held.worker, encodeHere, timers);
    const running = runner.run(flip, picture());
    timers.advance(WORKER_DEADLINES.apply);
    expect([...(await running).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(held.terminated()).toBe(true);
  });

  it('lets the studio get ready when the worker never answers its warm-up', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const runner = createRunner(() => heldWorker(false).worker, encodeHere, timers);
    const warming = runner.warm();
    timers.advance(WORKER_DEADLINES.warm);
    await expect(warming).resolves.toBeUndefined();
  });

  it('ignores an answer and an error from the stopped worker after this thread already finished', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const late = heldWorker();
    const fresh = heldWorker();
    const queue = [late, fresh];
    const runner = createRunner(() => queue.shift()?.worker ?? null, encodeHere, timers);
    const encoding = runner.encode({ ...page, paint: picture(), mask: null }, null);
    timers.advance(WORKER_DEADLINES.encode);
    const files = await encoding;
    expect([...files.png]).toEqual([7, 7]);

    // The fresh worker has a request in flight when the old one finally answers and then fails.
    const running = runner.run(flip, picture());
    await flush();
    const first = late.received[0];
    const second = fresh.received[0];
    if (first?.kind !== 'encode' || second?.kind !== 'apply') throw new Error('Unexpected requests.');
    late.answer({ kind: 'encoded', id: first.id, png: new Uint8Array([1]), thumbnail: new Uint8Array([1]) });
    late.answer({ kind: 'result', id: second.id, pixels: new Uint8ClampedArray(32).fill(9) });
    late.crash();
    await flush();
    expect([...files.png]).toEqual([7, 7]);
    expect(fresh.terminated()).toBe(false);
    fresh.answer({ kind: 'result', id: second.id, pixels: new Uint8ClampedArray(32).fill(3) });
    expect([...(await running).subarray(0, 4)]).toEqual([3, 3, 3, 3]);
  });

  it('fails the save when this thread cannot encode in time either, so the studio keeps the picture', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const runner = createRunner(
      () => heldWorker().worker,
      () => new Promise<never>(() => undefined),
      timers,
    );
    const encoding = runner.encode({ ...page, paint: picture(), mask: null }, null);
    const state = track(encoding);
    timers.advance(WORKER_DEADLINES.encode);
    // This thread's try starts once the worker's failure has passed through.
    await flush();
    timers.advance(WORKER_DEADLINES.encodeHere - 1);
    await flush();
    expect(state.settled).toBe(false);
    timers.advance(1);
    await expect(encoding).rejects.toThrow(
      new DeadlineError('Encoding the picture on this thread', WORKER_DEADLINES.encodeHere),
    );
  });

  it('stays on this thread after three workers in a row miss their deadline', async () => {
    const timers = createManualScheduler({ wall: 0 });
    let started = 0;
    const runner = createRunner(
      () => {
        started++;
        return heldWorker().worker;
      },
      encodeHere,
      timers,
    );
    for (let i = 0; i < 4; i++) {
      const running = runner.run(flip, picture());
      timers.advance(WORKER_DEADLINES.apply);
      expect([...(await running).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    }
    expect(started).toBe(3);
  });

  it('counts only stalls in a row: a worker that answers starts the count again', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const workers = Array.from({ length: 6 }, () => heldWorker());
    let started = 0;
    const runner = createRunner(() => workers[started++]?.worker ?? null, encodeHere, timers);
    const stallOnce = async (): Promise<void> => {
      const running = runner.run(flip, picture());
      await flush();
      timers.advance(WORKER_DEADLINES.apply);
      await running;
    };
    await stallOnce();
    await stallOnce();
    const answered = runner.run(flip, picture());
    await flush();
    const sent = workers[2]?.received[0];
    if (sent?.kind !== 'apply') throw new Error('Expected the third worker to get the effect.');
    workers[2]?.answer({ kind: 'result', id: sent.id, pixels: new Uint8ClampedArray(32) });
    await answered;
    await stallOnce();
    await stallOnce();
    await stallOnce();
    expect(started).toBe(5);
  });

  it('encodes on this thread at once when the worker crashes mid-save, without waiting for the deadline', async () => {
    const timers = createManualScheduler({ wall: 0 });
    const held = heldWorker();
    let started = 0;
    const runner = createRunner(
      () => {
        started++;
        return held.worker;
      },
      encodeHere,
      timers,
    );
    const encoding = runner.encode({ ...page, paint: picture(), mask: null }, null);
    held.crash();
    expect([...(await encoding).png]).toEqual([7, 7]);
    expect(held.terminated()).toBe(true);
    // A crashed worker is not started again.
    await runner.encode({ ...page, paint: picture(), mask: null }, null);
    expect(started).toBe(1);
  });
});
