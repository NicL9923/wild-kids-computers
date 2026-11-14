import { describe, expect, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { paintChecks, sceneWith } from '../../testing/scenes.ts';
import bulge from './index.ts';

function pixel(data: Uint8ClampedArray, x: number, y: number): number[] {
  const i = (y * 200 + x) * 4;
  return [...data.subarray(i, i + 4)];
}

describe('bulge effect', () => {
  it('puffs up the middle of a checkerboard', () => {
    expectGolden('effect-bulge', sceneWith(bulge, paintChecks).paint);
  });

  it('makes the middle check bigger and leaves the corners alone', () => {
    const before = sceneWith({ ...bulge, apply: (source, target) => target.data.set(source.data) }, paintChecks).paint;
    const after = sceneWith(bulge, paintChecks).paint;
    for (const [x, y] of [
      [0, 0],
      [199, 0],
      [0, 124],
      [199, 124],
      [20, 62],
    ] as const) {
      expect(pixel(after.data, x, y)).toEqual(pixel(before.data, x, y));
    }
    // A check is 10 pixels. Grown, the check left of the middle reaches 20 pixels from it.
    const middle = pixel(after.data, 99, 62);
    expect(pixel(after.data, 82, 62)).toEqual(middle);
    expect(pixel(before.data, 82, 62)).not.toEqual(middle);
  });
});
