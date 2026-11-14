import { hsv, toHsv } from '../../color.ts';
import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** How far around the color wheel a color moves: a third, so red turns green and green turns blue. */
const SHIFT = 1 / 3;

/** Swaps colors under the brush around the color wheel. White, gray, and black stay as they are. */
export default defineEffect({
  id: 'hueShift',
  order: 1,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      const { hue, saturation, value } = toHsv(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
      const shifted = hsv(hue + SHIFT, saturation, value);
      pixel[0] = shifted.r;
      pixel[1] = shifted.g;
      pixel[2] = shifted.b;
    }),
});
