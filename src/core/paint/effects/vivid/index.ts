import { luma, recolorStroke } from '../../recolor.ts';
import { clamp } from '../../math.ts';
import { defineEffect } from '../../types.ts';

/** How far each channel moves away from the pixel's gray. 1 would change nothing. */
const BOOST = 1.8;
/** Makes the colors under the brush brighter and bolder. Grays stay gray. */
export default defineEffect({
  id: 'vivid',
  order: 7,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      const gray = luma(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
      for (let k = 0; k < 3; k++) pixel[k] = clamp(Math.round(gray + ((pixel[k] ?? 0) - gray) * BOOST), 0, 255);
    }),
});
