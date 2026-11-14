import { div255 } from '../../color.ts';
import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** How far each channel moves toward white, out of 255. */
const LIGHTEN = 115;
/** Lightens the picture under the brush, like sunshine on it. */
export default defineEffect({
  id: 'sunny',
  order: 2,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      for (let k = 0; k < 3; k++) {
        const value = pixel[k] ?? 0;
        pixel[k] = value + div255((255 - value) * LIGHTEN);
      }
    }),
});
