import path from 'node:path';
import { BridgeError, type PrintResult } from '../../src/core/platform/bridge.ts';
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

/**
 * What a finished print job means for the bridge. Electron 45 reports the adult cancelling the
 * print dialog as the failure reason "Print job canceled", which is a choice, not a failure.
 */
export function printOutcome(success: boolean, failureReason: string): PrintResult | BridgeError {
  if (success) return 'printed';
  if (/\bcancel(?:l)?ed\b/i.test(failureReason)) return 'cancelled';
  return new BridgeError('io', `Printing failed: ${failureReason}`);
}
