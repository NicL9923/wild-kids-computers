import { cloneSurface, type Surface } from '../../../core/paint/surface.ts';
import type { PictureEffect } from '../../../core/paint/types.ts';
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
  dispose(): void;
}

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
 * Runs whole-picture effects in a worker. If the worker fails to start or dies, the runner applies
 * effects on this thread instead, so a child's choice always does something.
 */
export function createEffectRunner(makeWorker: () => WorkerLike | null): EffectRunner {
  let worker: WorkerLike | null = null;
  let broken = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function failAll(error: Error): void {
    broken = true;
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  }

  function ensureWorker(): WorkerLike | null {
    if (broken) return null;
    if (worker !== null) return worker;
    try {
      worker = makeWorker();
    } catch {
      worker = null;
    }
    if (worker === null) {
      broken = true;
      return null;
    }
    worker.addEventListener('message', (event: MessageEvent<EffectResponse>) => {
      const entry = pending.get(event.data.id);
      if (entry === undefined) return;
      pending.delete(event.data.id);
      entry.resolve(event.data);
    });
    worker.addEventListener('error', () => failAll(new Error('The effect worker stopped.')));
    return worker;
  }

  function send(request: EffectRequest, transfer: Transferable[]): Promise<EffectResponse> {
    const target = ensureWorker();
    if (target === null) return Promise.reject(new Error('No effect worker.'));
    return new Promise((resolve, reject) => {
      pending.set(request.id, { resolve, reject });
      target.postMessage(request, transfer);
    });
  }

  return {
    async warm() {
      await send({ kind: 'warm', id: nextId++ }, []).catch(() => undefined);
    },
    async run(effect, source) {
      const pixels = source.data.slice();
      try {
        const response = await send(
          { kind: 'apply', id: nextId++, effectId: effect.id, width: source.width, height: source.height, pixels },
          [pixels.buffer],
        );
        if (response.kind === 'result') return response.pixels;
      } catch {
        // Fall through to this thread.
      }
      return applyHere(effect, source);
    },
    dispose() {
      failAll(new Error('The studio closed.'));
    },
  };
}

/** The real worker. Vite bundles it as a module worker. */
export function startEffectWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./pictureEffect.worker.ts', import.meta.url), { type: 'module', name: 'picture-effects' });
}
