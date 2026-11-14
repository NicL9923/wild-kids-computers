import { describe, expect, it } from 'vitest';
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
});
