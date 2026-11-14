import { luma, recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** Washes the color out of the picture under the brush, leaving grays as light or dark as the colors were. */
export default defineEffect({
  id: 'grayWash',
  order: 4,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      const gray = luma(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
      pixel[0] = gray;
      pixel[1] = gray;
      pixel[2] = gray;
    }),
});
