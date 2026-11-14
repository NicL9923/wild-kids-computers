import { describe, expect, it } from 'vitest';
import { rgba } from '../../color.ts';
import { createSurface } from '../../surface.ts';
import { expectGolden } from '../../testing/golden.ts';
import { sceneWith } from '../../testing/scenes.ts';
import outlineSketch from './index.ts';

describe('outlineSketch effect', () => {
  it('outlines the scene over faded colors', () => {
    expectGolden('effect-outlineSketch', sceneWith(outlineSketch).paint);
  });

  it('draws a line between two colors of the same brightness and fades flat areas', () => {
    // Pure red and this green have the same brightness, so only a per-channel edge finds the line.
    const source = createSurface(20, 3);
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 3; y++) source.data.set(x < 10 ? [255, 0, 0, 255] : [0, 130, 0, 255], (y * 20 + x) * 4);
    }
    const target = createSurface(20, 3);
    outlineSketch.apply(source, target);
    const at = (x: number): number[] => [...target.data.subarray((20 + x) * 4, (20 + x) * 4 + 4)];
    expect(at(9)).toEqual([50, 45, 70, 255]);
    expect(at(10)).toEqual([50, 45, 70, 255]);
    expect(at(2)).toEqual([255, 166, 166, 255]);
    expect(at(17)).toEqual([166, 211, 166, 255]);
  });

  it('draws the same soft line along every edge of a full-width picture, centered on the edge', () => {
    // 1600 wide shrinks by 2 before finding edges. White, with a black block in the bottom right
    // whose corner sits at (800, 20).
    const width = 1600;
    const source = createSurface(width, 40, rgba(255, 255, 255));
    for (let y = 20; y < 40; y++)
      for (let x = 800; x < width; x++) source.data.set([0, 0, 0, 255], (y * width + x) * 4);
    const target = createSurface(width, 40);
    outlineSketch.apply(source, target);
    // How much ink covers a pixel, from its red channel: black fades to 166 and white stays 255,
    // and full ink is 50.
    const ink = (x: number, y: number): number => {
      const faded = (source.data[(y * width + x) * 4] ?? 0) === 0 ? 166 : 255;
      return Math.round(((faded - (target.data[(y * width + x) * 4] ?? 0)) / (faded - 50)) * 100) / 100;
    };
    const across = Array.from({ length: 14 }, (_, k) => ink(793 + k, 35));
    const down = Array.from({ length: 14 }, (_, k) => ink(1200, 13 + k));
    expect(down).toEqual(across);
    expect(across).toEqual(across.toReversed());
    expect(across[6]).toBe(1);
    expect(across[0]).toBe(0);
    expect(across.some((amount) => amount > 0 && amount < 1)).toBe(true);
  });
});
