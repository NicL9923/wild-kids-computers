import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { createSurface, surfaceFromData } from './surface.ts';
import { downscale, thumbnail } from './thumbnail.ts';

describe('downscale', () => {
  it('averages each block of source pixels', () => {
    const source = surfaceFromData(2, 2, new Uint8Array([0, 0, 0, 255, 100, 0, 0, 255, 0, 200, 0, 255, 0, 0, 40, 255]));
    expect([...downscale(source, 1, 1).data]).toEqual([25, 50, 10, 255]);
  });

  it('weights a source pixel by how much of it each target covers', () => {
    // Three source columns into two: the middle column is split evenly.
    const source = surfaceFromData(3, 1, new Uint8Array([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]));
    expect([...downscale(source, 2, 1).data]).toEqual([30, 30, 30, 255, 150, 150, 150, 255]);
  });

  it('lets transparent pixels lower alpha without darkening the color', () => {
    const source = surfaceFromData(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]));
    expect([...downscale(source, 1, 1).data]).toEqual([255, 0, 0, 128]);
    expect([...downscale(createSurface(2, 2), 1, 1).data]).toEqual([0, 0, 0, 0]);
  });

  it('refuses to make a picture larger', () => {
    expect(() => downscale(createSurface(4, 4), 5, 4)).toThrow('Cannot downscale 4 by 4 to a larger 5 by 4');
  });
});

describe('thumbnail', () => {
  it('fits the canvas into the box and keeps its 16:10 shape', () => {
    const thumb = thumbnail(createSurface(1600, 1000, rgba(10, 20, 30)), 320, 320);
    expect([thumb.width, thumb.height]).toEqual([320, 200]);
    expect([...thumb.data.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it('never enlarges a small picture', () => {
    const thumb = thumbnail(createSurface(10, 5), 320, 200);
    expect([thumb.width, thumb.height]).toEqual([10, 5]);
  });
});
