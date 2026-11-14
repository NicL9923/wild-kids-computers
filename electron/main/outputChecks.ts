import path from 'node:path';
import { BridgeError } from '../../src/core/platform/bridge.ts';
import { hasPngSignature, MAX_PICTURE_BYTES } from '../../src/core/platform/limits.ts';

export function checkOutputPng(png: Uint8Array): void {
  if (png.length > MAX_PICTURE_BYTES)
    throw new BridgeError('too-large', `The picture is over ${MAX_PICTURE_BYTES} bytes.`);
  if (!hasPngSignature(png)) throw new BridgeError('invalid-argument', 'The picture is not a PNG file.');
}

/** The chosen path, with `.png` added when the adult typed a name without it. */
export function exportTarget(chosenPath: string): string {
  return path.extname(chosenPath).toLowerCase() === '.png' ? chosenPath : `${chosenPath}.png`;
}
