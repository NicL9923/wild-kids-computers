import { trailStroke } from '../../dab.ts';
import { defineEffect } from '../../types.ts';
import { warpDab } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. Wide, so a slow stroke does not blow up too fast. */
const SPACING = 0.5;
/** How much the middle of a dab grows: it reads from 1 - STRENGTH of the distance, so 0.5 is twice the size. */
const STRENGTH = 0.5;

/** Puffs the picture up under the brush like a balloon, bigger in the middle and joined smoothly at the edge. */
export default defineEffect({
  id: 'puff',
  order: 4,
  group: 'distort',
  stroke: (ctx) =>
    trailStroke(ctx, ctx.settings.size * SPACING, (dab) => {
      const radius = dab.size / 2;
      return warpDab(ctx.doc, ctx.change, { x: dab.x, y: dab.y, radius, reach: 0 }, (dx, dy, distance, from) => {
        // Reads from closer to the center. The scale reaches 1 at the edge, so the puff has no seam.
        const rest = 1 - distance / radius;
        const scale = 1 - STRENGTH * rest * rest;
        from[0] = dx * scale;
        from[1] = dy * scale;
        return true;
      });
    }),
});
