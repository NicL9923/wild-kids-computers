import { describe, expect, it } from 'vitest';
import { expectGolden } from '../../testing/golden.ts';
import { sceneWith } from '../../testing/scenes.ts';
import pictureGrid from './index.ts';

describe('pictureGrid effect', () => {
  it('repeats the scene three across and three down', () => {
    expectGolden('effect-pictureGrid', sceneWith(pictureGrid).paint);
  });

  it('makes all nine copies the same', () => {
    const { data } = sceneWith(pictureGrid).paint;
    // 200 by 125 splits into tiles starting at 0, 67, 134 across and 0, 42, 84 down; each holds a 66 by 41 copy.
    const tile = (left: number, top: number): number[] => {
      const pixels: number[] = [];
      for (let y = top; y < top + 41; y++)
        pixels.push(...data.subarray((y * 200 + left) * 4, (y * 200 + left + 66) * 4));
      return pixels;
    };
    const first = tile(0, 0);
    for (const left of [0, 67, 134]) {
      for (const top of [0, 42, 84]) expect(tile(left, top), `${left}, ${top}`).toEqual(first);
    }
  });
});
