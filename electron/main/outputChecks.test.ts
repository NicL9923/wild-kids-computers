import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { isBridgeError } from '../../src/core/platform/bridge.ts';
import { MAX_PICTURE_BYTES } from '../../src/core/platform/limits.ts';
import { checkOutputPng, exportTarget, printOutcome, resolvePicturesDir } from './outputChecks.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('exportTarget', () => {
  it.each([
    ['/home/a/Pictures/fox.png', '/home/a/Pictures/fox.png'],
    ['/home/a/Pictures/fox.PNG', '/home/a/Pictures/fox.PNG'],
    ['/home/a/Pictures/fox', '/home/a/Pictures/fox.png'],
    ['/home/a/Pictures/fox.jpg', '/home/a/Pictures/fox.jpg.png'],
  ])('saves %s as %s', (chosen, target) => {
    expect(exportTarget(chosen)).toBe(target);
  });
});

describe('checkOutputPng', () => {
  it('accepts a PNG at the cap', () => {
    const atCap = new Uint8Array(MAX_PICTURE_BYTES);
    atCap.set(SIGNATURE);
    expect(() => checkOutputPng(atCap)).not.toThrow();
  });

  it.each([
    ['bytes over the cap', new Uint8Array(MAX_PICTURE_BYTES + 1), 'too-large'],
    ['bytes that are not a PNG', Uint8Array.from([1, 2, 3]), 'invalid-argument'],
  ])('rejects %s', (_label, bytes, code) => {
    let thrown: unknown;
    try {
      checkOutputPng(bytes);
    } catch (error) {
      thrown = error;
    }
    expect(isBridgeError(thrown) ? thrown.code : thrown).toBe(code);
  });
});

describe('printOutcome', () => {
  // The reasons are the ones Electron 45 documents for webContents.print.
  it.each([
    ['a finished job', true, '', 'printed'],
    ['the adult cancelling the dialog', false, 'Print job canceled', 'cancelled'],
  ])('reports %s', (_label, success, reason, result) => {
    expect(printOutcome(success, reason)).toBe(result);
  });

  it.each(['Print job failed', 'Invalid printer settings'])('reports "%s" as an io failure', (reason) => {
    const outcome = printOutcome(false, reason);
    expect(isBridgeError(outcome) ? [outcome.code, outcome.message] : outcome).toEqual([
      'io',
      `Printing failed: ${reason}`,
    ]);
  });
});

describe('resolvePicturesDir', () => {
  it('falls back from pictures to documents, home, and os.homedir when xdg-user-dirs is missing', () => {
    expect(resolvePicturesDir((name) => (name === 'pictures' ? '/home/a/Pictures' : ''))).toBe('/home/a/Pictures');
    expect(
      resolvePicturesDir((name) => {
        if (name === 'pictures') throw new Error("Failed to get 'pictures' path");
        return name === 'documents' ? '/home/a/Documents' : '/home/a';
      }),
    ).toBe('/home/a/Documents');
    expect(
      resolvePicturesDir(() => {
        throw new Error('no path');
      }),
    ).toBe(os.homedir());
  });
});
