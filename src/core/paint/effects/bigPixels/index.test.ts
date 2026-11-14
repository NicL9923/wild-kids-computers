import { describe, expect, it } from 'vitest';
import { createSurface } from '../../surface.ts';
import { expectGolden } from '../../testing/golden.ts';
import { sceneWith } from '../../testing/scenes.ts';
import bigPixels from './index.ts';

describe('bigPixels effect', () => {
  it('turns the scene into big blocks', () => {
    expectGolden('effect-bigPixels', sceneWith(bigPixels).paint);
  });

  it('paints each block in one color, including the cut-off blocks at the edges', () => {
    const { data } = sceneWith(bigPixels).paint;
    // 200 pixels wide makes 5 pixel blocks; the bottom row of blocks is cut to 5 rows exactly, so check a 7 wide picture too.
    for (let top = 0; top < 125; top += 5) {
      for (let left = 0; left < 200; left += 5) {
        const first = data.subarray((top * 200 + left) * 4, (top * 200 + left) * 4 + 4);
        for (let y = top; y < top + 5; y++) {
          for (let x = left; x < left + 5; x++) {
            expect(data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4)).toEqual(first);
          }
        }
      }
    }
    const narrow = createSurface(3, 1);
    narrow.data.set([10, 10, 10, 255, 30, 30, 30, 255, 200, 200, 200, 255]);
    const out = createSurface(3, 1);
    bigPixels.apply(narrow, out);
    expect([...out.data]).toEqual([20, 20, 20, 255, 20, 20, 20, 255, 200, 200, 200, 255]);
  });

  it('does not let transparent pixels darken a block', () => {
    const source = createSurface(2, 1);
    // A transparent pixel keeps whatever color it had, here white, and must not lighten the block.
    source.data.set([220, 40, 40, 255, 255, 255, 255, 0]);
    const target = createSurface(2, 1);
    bigPixels.apply(source, target);
    expect([...target.data]).toEqual([220, 40, 40, 128, 220, 40, 40, 128]);
  });
});
