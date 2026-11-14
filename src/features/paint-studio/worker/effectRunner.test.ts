import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createSurface, surfaceFromData } from '../../../core/paint/surface.ts';
import type { PictureEffect } from '../../../core/paint/types.ts';
import { paintEffects } from '../../../registry/paint.ts';
import { createEffectRunner, type WorkerLike } from './effectRunner.ts';
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
  const listeners: { message: ((event: MessageEvent<EffectResponse>) => void)[]; error: ((event: Event) => void)[] } = {
    message: [],
    error: [],
  };
  let terminated = false;
  const worker: WorkerLike = {
    postMessage(message) {
      received.push(message);
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
  return { worker, received, terminated: () => terminated };
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

    const none = createEffectRunner(() => null);
    expect([...(await none.run(flip, picture())).subarray(12, 16)]).toEqual([255, 0, 0, 255]);
  });
});
