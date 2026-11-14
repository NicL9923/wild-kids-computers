import { hsv, toHsv } from '../../color.ts';
import { DabCanvas, discCoverage, forEachInDisc, trailStroke } from '../../dab.ts';
import { defineEffect } from '../../types.ts';

/** How far around the color wheel a color moves: a third, so red turns green and green turns blue. */
const SHIFT = 1 / 3;

/** Swaps colors under the brush around the color wheel. White, gray, and black stay as they are. */
export default defineEffect({
  id: 'hueShift',
  order: 1,
  group: 'color',
  stroke: (ctx) => {
    const canvas = new DabCanvas(ctx.doc, ctx.change);
    const before = [0, 0, 0, 0];
    return trailStroke(
      ctx,
      ctx.settings.size * 0.1,
      (dab) => {
        const radius = dab.size / 2;
        forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
          canvas.readBefore(x, y, before);
          const { hue, saturation, value } = toHsv(before[0] ?? 0, before[1] ?? 0, before[2] ?? 0);
          const shifted = hsv(hue + SHIFT, saturation, value);
          canvas.put(x, y, discCoverage(radius, distance), shifted.r, shifted.g, shifted.b);
        });
        return canvas.takeChanged();
      },
      () => canvas.finish(),
    );
  },
});
