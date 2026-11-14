import { describe, expect, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { isSymmetric, scenePicture, sceneWith } from '../../testing/scenes.ts';
import fourCorners from './index.ts';

describe('fourCorners effect', () => {
  it('copies the top left quarter of the scene into every corner', () => {
    expectGolden('effect-fourCorners', sceneWith(fourCorners).paint);
  });

  it('keeps the top left quarter and mirrors it both ways', () => {
    const result = sceneWith(fourCorners).paint;
    expect(isSymmetric(result)).toEqual({ sideways: true, upDown: true });
    const scene = scenePicture();
    for (let y = 0; y < 62; y++) {
      const start = y * 200 * 4;
      expect(result.data.subarray(start, start + 100 * 4)).toEqual(scene.data.subarray(start, start + 100 * 4));
    }
  });
});
