import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** Swaps each color under the brush for its opposite: black for white, blue for yellow, red for cyan. */
export default defineEffect({
  id: 'opposites',
  order: 6,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      for (let k = 0; k < 3; k++) pixel[k] = 255 - (pixel[k] ?? 0);
    }),
});
