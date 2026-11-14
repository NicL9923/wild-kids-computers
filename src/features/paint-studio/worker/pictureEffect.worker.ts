import { surfaceFromData } from '../../../core/paint/surface.ts';
import { paintEffects } from '../../../registry/paint.ts';
import type { EffectRequest, EffectResponse } from './protocol.ts';

/**
 * Runs whole-picture effects off the main thread, so the screen never freezes. Each request
 * carries its own copy of the pixels and gets the result back as a transferred buffer.
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
  try {
    const effect = paintEffects.find((item) => item.id === request.effectId);
    if (effect?.group !== 'whole-picture') throw new Error(`No whole-picture effect "${request.effectId}".`);
    const source = surfaceFromData(request.width, request.height, request.pixels);
    const target = surfaceFromData(request.width, request.height, request.pixels);
    effect.apply(source, target);
    respond({ kind: 'result', id: request.id, pixels: target.data }, [target.data.buffer]);
  } catch (error) {
    respond({ kind: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
});
