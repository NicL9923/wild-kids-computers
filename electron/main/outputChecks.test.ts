import { describe, expect, it } from 'vitest';
import { isBridgeError } from '../../src/core/platform/bridge.ts';
import { MAX_PICTURE_BYTES } from '../../src/core/platform/limits.ts';
import { checkOutputPng, exportTarget } from './outputChecks.ts';

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
