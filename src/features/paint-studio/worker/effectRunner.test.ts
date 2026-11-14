import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface, surfaceFromData } from '../../../core/paint/surface.ts';
import type { PictureEffect } from '../../../core/paint/types.ts';
import { paintEffects } from '../../../registry/paint.ts';
import { createEffectRunner, startEffectWorker, type WorkerLike } from './effectRunner.ts';
import type { EffectRequest, EffectResponse } from './protocol.ts';

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
  const source = surfaceFromData(request.width, request.height, request.pixels);
  const target = surfaceFromData(request.width, request.height, request.pixels);
  flip?.apply(source, target);
  return { kind: 'result', id: request.id, pixels: target.data };
}

describe('effect runner', () => {
  it('sends a copy of the pixels to the worker and returns its result, leaving the source alone', async () => {
    const fake = fakeWorker(applyInFake);
    const runner = createEffectRunner(() => fake.worker);
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
    const result = await createEffectRunner(() => fake.worker).run(flip, picture());
    expect([...result.subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  });

  it('falls back for good when the worker crashes or cannot start', async () => {
    const crashing = fakeWorker(() => 'crash');
    const runner = createEffectRunner(() => crashing.worker);
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(crashing.terminated()).toBe(true);
    await runner.run(flip, picture());
    expect(crashing.received).toHaveLength(1);

    let attempts = 0;
    const none = createEffectRunner(() => {
      attempts++;
      return null;
    });
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
    });
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
    const runner = createEffectRunner(() => fake.worker);
    await runner.warm();
    runner.dispose();
    expect(fake.terminated()).toBe(true);
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(fake.received).toHaveLength(1);
  });

  it('applies effects on this thread when making the worker throws', async () => {
    const runner = createEffectRunner(() => {
      throw new Error('workers are off');
    });
    await runner.warm();
    expect([...(await runner.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  });

  it('has no worker to start outside a browser', () => {
    expect(startEffectWorker()).toBeNull();
  });
});
