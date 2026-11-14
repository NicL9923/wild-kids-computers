import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { cloneSurface, copyRect, createSurface, MAX_SURFACE_SIDE, surfaceFromData } from './surface.ts';

describe('surfaces', () => {
  it('starts transparent, or filled with every pixel the given color', () => {
    expect([...createSurface(2, 1).data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...createSurface(2, 1, rgba(1, 2, 3, 4)).data]).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });

  it.each([
    ['a zero width', 0, 5, 'width'],
    ['a fractional height', 5, 2.5, 'height'],
    ['a side over the limit', MAX_SURFACE_SIDE + 1, 5, 'width'],
    ['NaN', Number.NaN, 5, 'width'],
  ])('rejects %s', (_label, width, height, side) => {
    expect(() => createSurface(width, height)).toThrow(`Surface ${side} must be an integer`);
  });

  it('wraps decoded bytes only when the length matches the size', () => {
    expect(surfaceFromData(1, 1, new Uint8Array([9, 8, 7, 6])).data[0]).toBe(9);
    expect(() => surfaceFromData(2, 2, new Uint8Array(15))).toThrow('Expected 16 bytes for 2 by 2 pixels, got 15');
  });

  it('clones without sharing pixels and copies only the given rectangle', () => {
    const source = createSurface(3, 2, rgba(9, 9, 9));
    const clone = cloneSurface(source);
    clone.data[0] = 1;
    expect(source.data[0]).toBe(9);
    const target = createSurface(3, 2);
    copyRect(source, target, { x: 1, y: 1, width: 2, height: 1 });
    expect([...target.data.subarray(0, 12)].every((v) => v === 0)).toBe(true);
    expect([...target.data.subarray(16, 24)]).toEqual([9, 9, 9, 255, 9, 9, 9, 255]);
  });
});
