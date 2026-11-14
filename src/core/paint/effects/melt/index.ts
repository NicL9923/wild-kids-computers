import { trailStroke } from '../../dab.ts';
import { valueNoise } from '../../random.ts';
import { defineEffect } from '../../types.ts';
import { warpDab } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.15;
/** The longest drop per dab, as a fraction of the size. */
const DROP = 0.12;
/** The width of one drip, as a fraction of the size. */
const DRIP_WIDTH = 0.08;

/**
 * Makes the picture run down under the brush like melting wax. Some columns drip farther than
 * others. The stroke seed picks which, and they stay the same for the whole stroke, so going over
 * a spot makes its drips longer.
 */
export default defineEffect({
  id: 'melt',
  order: 9,
  group: 'distort',
  stroke: (ctx) => {
    const size = ctx.settings.size;
    const drop = size * DROP;
    const dripWidth = Math.max(2, size * DRIP_WIDTH);
    // How far each column drips, 0 to 1, worked out on first use.
    const drips = new Float32Array(ctx.doc.width).fill(Number.NaN);
    return trailStroke(ctx, size * SPACING, (dab) => {
      const radius = dab.size / 2;
      return warpDab(ctx.doc, ctx.change, { x: dab.x, y: dab.y, radius, reach: drop }, (dx, dy, distance, from) => {
        const t = distance / radius;
        const column = Math.floor(dab.x + dx);
        let drip = drips[column] ?? 0;
        if (Number.isNaN(drip)) {
          drip = valueNoise(column + 0.5, 0, dripWidth, dab.seed);
          drips[column] = drip;
        }
        from[0] = dx;
        from[1] = dy - drop * (1 - t * t) * (0.15 + 0.85 * drip);
        return true;
      });
    });
  },
});
