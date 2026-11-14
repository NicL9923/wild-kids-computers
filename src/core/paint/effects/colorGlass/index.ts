import { div255 } from '../../color.ts';
import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/**
 * Looks at the picture under the brush through glass of the chosen color. White paper takes the
 * color, and darker paint shows through it, darker still.
 */
export default defineEffect({
  id: 'colorGlass',
  order: 8,
  group: 'color',
  stroke: (ctx) => {
    const { r, g, b } = ctx.settings.color;
    return recolorStroke(ctx, (pixel) => {
      pixel[0] = div255((pixel[0] ?? 0) * r);
      pixel[1] = div255((pixel[1] ?? 0) * g);
      pixel[2] = div255((pixel[2] ?? 0) * b);
    });
  },
});
