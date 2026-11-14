import { rgba } from '../../color.ts';
import { luma, recolorStroke, toneRamp } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** Brown tones from dark to light, picked by how light each pixel is. */
const TONES = toneRamp([
  [0, rgba(40, 24, 12)],
  [128, rgba(165, 118, 72)],
  [255, rgba(255, 242, 210)],
]);
/** Turns the picture under the brush into brown and cream, like a very old photograph. */
export default defineEffect({
  id: 'oldPhoto',
  order: 5,
  group: 'color',
  stroke: (ctx) =>
    recolorStroke(ctx, (pixel) => {
      const tone = luma(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0) * 3;
      pixel[0] = TONES[tone] ?? 0;
      pixel[1] = TONES[tone + 1] ?? 0;
      pixel[2] = TONES[tone + 2] ?? 0;
    }),
});
