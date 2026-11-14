import { defineEffect } from '../../types.ts';

/** About forty blocks across, whatever the picture size. */
const BLOCKS_ACROSS = 40;

/**
 * Turns the picture into big square blocks, each the average color of the pixels it covers,
 * like a picture made of building bricks. Transparent pixels do not darken a block: the
 * average is weighted by alpha.
 */
export default defineEffect({
  id: 'bigPixels',
  order: 9,
  group: 'whole-picture',
  apply(source, target) {
    if (source.width !== target.width || source.height !== target.height) {
      throw new RangeError('Source and target must be the same size.');
    }
    const { width, height } = source;
    const block = Math.max(2, Math.round(width / BLOCKS_ACROSS));
    const input = source.data;
    const output = target.data;
    for (let top = 0; top < height; top += block) {
      const bottom = Math.min(height, top + block);
      for (let left = 0; left < width; left += block) {
        const right = Math.min(width, left + block);
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let y = top; y < bottom; y++) {
          for (let i = (y * width + left) * 4, end = (y * width + right) * 4; i < end; i += 4) {
            const alpha = input[i + 3] ?? 0;
            r += (input[i] ?? 0) * alpha;
            g += (input[i + 1] ?? 0) * alpha;
            b += (input[i + 2] ?? 0) * alpha;
            a += alpha;
          }
        }
        const count = (bottom - top) * (right - left);
        const red = a > 0 ? Math.round(r / a) : 0;
        const green = a > 0 ? Math.round(g / a) : 0;
        const blue = a > 0 ? Math.round(b / a) : 0;
        const alpha = Math.round(a / count);
        for (let y = top; y < bottom; y++) {
          for (let i = (y * width + left) * 4, end = (y * width + right) * 4; i < end; i += 4) {
            output[i] = red;
            output[i + 1] = green;
            output[i + 2] = blue;
            output[i + 3] = alpha;
          }
        }
      }
    }
  },
});
