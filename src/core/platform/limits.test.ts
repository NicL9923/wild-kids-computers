import { describe, expect, it } from 'vitest';
import { hasPngSignature, utf8ByteLength } from './limits.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('hasPngSignature', () => {
  it('accepts bytes that start with the PNG signature', () => {
    expect(hasPngSignature(Uint8Array.from([...SIGNATURE, 0, 0, 0, 13]))).toBe(true);
    expect(hasPngSignature(Uint8Array.from(SIGNATURE))).toBe(true);
  });

  it.each([
    ['no bytes', []],
    ['a truncated signature', SIGNATURE.slice(0, 7)],
    ['a wrong first byte', [0x88, ...SIGNATURE.slice(1)]],
    ['a wrong last byte', [...SIGNATURE.slice(0, 7), 0x0b]],
    ['a JPEG', [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]],
  ])('rejects %s', (_label, bytes) => {
    expect(hasPngSignature(Uint8Array.from(bytes))).toBe(false);
  });
});

describe('utf8ByteLength', () => {
  it('counts bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('🦊')).toBe(4);
  });
});
