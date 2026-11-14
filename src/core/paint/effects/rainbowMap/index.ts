import { hsv } from '../../color.ts';
import { luma, recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** How far around the color wheel lightness reaches, in turns: red at black, through the rainbow, to violet at white. */
const HUES = 0.78;
/** Red, green, and blue for each lightness, at index lightness * 3. */
const RAINBOW = new Uint8Array(256 * 3);
for (let l = 0; l < 256; l++) {
  const color = hsv((l / 255) * HUES, 0.85, 1);
  RAINBOW.set([color.r, color.g, color.b], l * 3);
}

/** Paints a rainbow by lightness: the darkest parts of the picture turn red and the lightest turn violet. */
export default defineEffect({
  id: 'rainbowMap',
  order: 10,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      const tone = luma(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0) * 3;
      pixel[0] = RAINBOW[tone] ?? 0;
      pixel[1] = RAINBOW[tone + 1] ?? 0;
      pixel[2] = RAINBOW[tone + 2] ?? 0;
    }),
});
