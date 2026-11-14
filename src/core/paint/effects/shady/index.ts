import { div255 } from '../../color.ts';
import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** How much of each channel stays, out of 255. */
const KEEP = 140;
/** Darkens the picture under the brush, like the shade of a tree. */
export default defineEffect({
  id: 'shady',
  order: 3,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      for (let k = 0; k < 3; k++) pixel[k] = div255((pixel[k] ?? 0) * KEEP);
    }),
});
