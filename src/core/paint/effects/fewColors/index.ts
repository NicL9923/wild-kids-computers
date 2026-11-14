import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** Levels per channel: 0, 128, and 255, which gives 27 colors. */
const STEP = 127.5;
/**
 * Rounds each color under the brush to the nearest of a few bold ones, like a poster printed
 * with only a few inks. Smooth shading turns into flat bands.
 */
export default defineEffect({
  id: 'fewColors',
  order: 9,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      for (let k = 0; k < 3; k++) pixel[k] = Math.round(Math.round((pixel[k] ?? 0) / STEP) * STEP);
    }),
});
