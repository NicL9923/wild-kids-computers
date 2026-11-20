import { blendPixel } from '../../../core/paint/color.ts';
import { cloneSurface, wrapSurface } from '../../../core/paint/surface.ts';
import { encodePicture } from '../studio/pictureFile.ts';
import { paintEffects } from '../../../registry/paint.ts';
import type { EffectRequest, EffectResponse } from './protocol.ts';

/**
 * Runs whole-picture effects and the gallery's PNG encoding off the main thread, so the screen
 * never freezes and a fill never waits for a save. Each request carries its own copy of the
 * pixels and gets the result back as a transferred buffer.
 */
interface WorkerScope {
  postMessage(message: EffectResponse, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EffectRequest>) => void): void;
}

// The app's type check uses the DOM library, which has no worker global scope type.
function isWorkerScope(value: unknown): value is WorkerScope {
  return typeof value === 'object' && value !== null && 'postMessage' in value && 'addEventListener' in value;
}

const global: unknown = globalThis;
if (!isWorkerScope(global)) throw new Error('The picture effect worker must run in a worker.');
const scope = global;

function respond(response: EffectResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

scope.addEventListener('message', (event: MessageEvent<EffectRequest>) => {
  const request = event.data;
  if (request.kind === 'warm') {
    respond({ kind: 'ready', id: request.id });
    return;
  }
  if (request.kind === 'encode') {
    const { width, height } = request;
    // The worker already owns these transferred buffers, so wrap them in place and blend the mask
    // directly onto paint instead of allocating extra full-canvas copies.
    const paint = wrapSurface(width, height, request.paint);
    if (request.mask !== null) {
      const mask = request.mask;
      const target = paint.data;
      for (let i = 0; i < mask.length; i += 4) {
        const a = mask[i + 3] ?? 0;
        if (a !== 0) blendPixel(target, i, mask[i] ?? 0, mask[i + 1] ?? 0, mask[i + 2] ?? 0, a);
      }
    }
    encodePicture({ width, height, paint, mask: null }, request.pageId).then(
      ({ png, thumbnail }) =>
        respond({ kind: 'encoded', id: request.id, png, thumbnail }, [png.buffer, thumbnail.buffer]),
      (error: unknown) =>
        respond({ kind: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) }),
    );
    return;
  }
  try {
    const effect = paintEffects.find((item) => item.id === request.effectId);
    if (effect?.group !== 'whole-picture') throw new Error(`No whole-picture effect "${request.effectId}".`);
    const source = wrapSurface(request.width, request.height, request.pixels);
    const target = cloneSurface(source);
    effect.apply(source, target);
    respond({ kind: 'result', id: request.id, pixels: target.data }, [target.data.buffer]);
  } catch (error) {
    respond({ kind: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
});
