import type { PaintDocument } from '../../../core/paint/document.ts';
import { cloneSurface, surfaceFromData, type Surface } from '../../../core/paint/surface.ts';
import type { PictureEffect } from '../../../core/paint/types.ts';
import { DeadlineError, withDeadline } from '../../../core/activityKit/deadline.ts';
import type { Scheduler } from '../../../core/activityKit/scheduler.ts';
import type { EncodedPicture } from '../studio/autosave.ts';
import type { EffectRequest, EffectResponse } from './protocol.ts';

/** The part of a Worker the runner uses, so tests can pass a fake. */
export interface WorkerLike {
  postMessage(message: EffectRequest, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EffectResponse>) => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

export interface EffectRunner {
  /** Starts the worker and loads the effects, so the first effect the child picks is quick. */
  warm(): Promise<void>;
  /** The effect applied to a copy of the pixels. The source is never changed. */
  run(effect: PictureEffect, source: Surface): Promise<Uint8ClampedArray>;
  /**
   * The gallery files for a picture. The pixels are copied before it returns, so the child can
   * paint on while the worker encodes.
   */
  encode(doc: PaintDocument, pageId: string | null): Promise<EncodedPicture>;
  dispose(): void;
}

/**
 * How long each request to the worker may take, in milliseconds, before the runner gives up on
 * that worker. `npm run perf` measures the round trips on a 1600 by 1000 picture. On an Intel
 * i9-14900HX, starting the worker took 15 ms, the slowest effect (outlineSketch) 252 ms, and
 * encoding a picture of pure noise, the hardest case for PNG, at most 578 ms. Each deadline is at
 * least 15 times its slowest measured round trip, room for a slow school laptop that is busy.
 */
export interface WorkerDeadlines {
  /** Starting the worker and loading the effects. The studio waits for it before it is ready. */
  readonly warm: number;
  /** One whole-picture effect. Painting waits for it. */
  readonly apply: number;
  /** The gallery files. Leaving the studio waits for them. */
  readonly encode: number;
  /** The gallery files on this thread, after the worker failed. The last try before the save fails. */
  readonly encodeHere: number;
}

export const WORKER_DEADLINES: WorkerDeadlines = Object.freeze({
  warm: 10_000,
  apply: 5_000,
  encode: 10_000,
  encodeHere: 10_000,
});

/**
 * After this many workers in a row miss a deadline, effects and encoding stay on this thread. A
 * worker that answered anything since then resets the count.
 */
const MAX_STALLED_WORKERS = 3;

interface Pending {
  resolve: (response: EffectResponse) => void;
  reject: (error: Error) => void;
}

/** Applies the effect on this thread. The fallback when a worker cannot start. */
function applyHere(effect: PictureEffect, source: Surface): Uint8ClampedArray {
  const target = cloneSurface(source);
  effect.apply(cloneSurface(source), target);
  return target.data;
}

/**
 * Runs whole-picture effects in a worker. If the worker fails to start, dies, or does not answer
 * in time, the runner does the work on this thread instead, so a child's choice always does
 * something and a save always ends. A worker that missed a deadline is stopped, and the next
 * request starts a fresh one; one that crashed is not started again.
 *
 * `timers` must run in real time, such as `systemScheduler()`: the worker does.
 */
export function createEffectRunner(
  makeWorker: () => WorkerLike | null,
  encodeHere: (doc: PaintDocument, pageId: string | null) => Promise<EncodedPicture>,
  timers: Pick<Scheduler, 'setTimeout'>,
  deadlines: WorkerDeadlines = WORKER_DEADLINES,
): EffectRunner {
  let worker: WorkerLike | null = null;
  let broken = false;
  let stalled = 0;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  /** Stops the worker and fails every request it holds, so each one falls back to this thread. */
  function stop(error: Error): void {
    const stopping = worker;
    worker = null;
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    stopping?.terminate();
  }

  function ensureWorker(): WorkerLike | null {
    if (broken) return null;
    if (worker !== null) return worker;
    let started: WorkerLike | null;
    try {
      started = makeWorker();
    } catch {
      started = null;
    }
    if (started === null) {
      broken = true;
      return null;
    }
    const current = started;
    worker = current;
    // A worker that was stopped can still have a message or an error on its way. Only the
    // current worker is heard, so a late answer never lands and a late error never stops the
    // fresh worker.
    current.addEventListener('message', (event: MessageEvent<EffectResponse>) => {
      if (worker !== current) return;
      stalled = 0;
      const entry = pending.get(event.data.id);
      if (entry === undefined) return;
      pending.delete(event.data.id);
      entry.resolve(event.data);
    });
    current.addEventListener('error', () => {
      if (worker !== current) return;
      broken = true;
      stop(new Error('The effect worker stopped.'));
    });
    return current;
  }

  function send(request: EffectRequest, transfer: Transferable[], deadlineMs: number): Promise<EffectResponse> {
    const target = ensureWorker();
    if (target === null) return Promise.reject(new Error('No effect worker.'));
    return new Promise((resolve, reject) => {
      // Settling a request cancels its timer, so this runs only while `target` is still current.
      const cancel = timers.setTimeout(() => {
        stalled += 1;
        if (stalled >= MAX_STALLED_WORKERS) broken = true;
        stop(new DeadlineError(`The effect worker's ${request.kind}`, deadlineMs));
      }, deadlineMs);
      pending.set(request.id, {
        resolve: (response) => {
          cancel();
          resolve(response);
        },
        reject: (error) => {
          cancel();
          reject(error);
        },
      });
      try {
        target.postMessage(request, transfer);
      } catch (error) {
        pending.delete(request.id);
        cancel();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  return {
    async warm() {
      await send({ kind: 'warm', id: nextId++ }, [], deadlines.warm).catch(() => undefined);
    },
    async run(effect, source) {
      const pixels = source.data.slice();
      try {
        const response = await send(
          { kind: 'apply', id: nextId++, effectId: effect.id, width: source.width, height: source.height, pixels },
          [pixels.buffer],
          deadlines.apply,
        );
        if (response.kind === 'result') return response.pixels;
      } catch {
        // Fall through to this thread.
      }
      return applyHere(effect, source);
    },
    async encode(doc, pageId) {
      const { width, height } = doc;
      const paint = doc.paint.data.slice();
      const mask = doc.mask === null ? null : doc.mask.data.slice();
      try {
        const request = { kind: 'encode', id: nextId++, width, height, paint, mask, pageId } as const;
        const response = await send(
          request,
          mask === null ? [paint.buffer] : [paint.buffer, mask.buffer],
          deadlines.encode,
        );
        if (response.kind === 'encoded') return { png: response.png, thumbnail: response.thumbnail };
      } catch {
        // Fall through to this thread.
      }
      // A copy the worker never received is still here. One it did receive went with it, so this
      // thread encodes the picture as it is now.
      const here =
        paint.byteLength === 0
          ? doc
          : {
              width,
              height,
              paint: surfaceFromData(width, height, paint),
              mask: mask === null ? null : surfaceFromData(width, height, mask),
            };
      // If this thread cannot encode either, the save fails the usual way: the picture stays.
      return withDeadline(
        encodeHere(here, pageId),
        deadlines.encodeHere,
        timers,
        'Encoding the picture on this thread',
      );
    },
    dispose() {
      broken = true;
      stop(new Error('The studio closed.'));
    },
  };
}

/** The real worker. Vite bundles it as a module worker. */
export function startEffectWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./pictureEffect.worker.ts', import.meta.url), { type: 'module', name: 'picture-effects' });
}
