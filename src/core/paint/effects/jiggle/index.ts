import { trailStroke } from '../../dab.ts';
import { hash2, mixSeed } from '../../random.ts';
import { defineEffect } from '../../types.ts';
import { warpDab } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.3;
/** The farthest a pixel jumps, as a fraction of the size, and at least MIN_JUMP pixels. */
const JUMP = 0.06;
const MIN_JUMP = 2;

/**
 * Shakes the picture into sand under the brush: each pixel takes the color of a neighbor a few
 * pixels away. The stroke seed and the dab decide which neighbor.
 */
export default defineEffect({
  id: 'jiggle',
  order: 10,
  group: 'distort',
  stroke: (ctx) => {
    const jump = Math.max(MIN_JUMP, ctx.settings.size * JUMP);
    return trailStroke(ctx, ctx.settings.size * SPACING, (dab) => {
      const radius = dab.size / 2;
      const seed = mixSeed(dab.seed, dab.index);
      return warpDab(ctx.doc, ctx.change, { x: dab.x, y: dab.y, radius, reach: jump }, (dx, dy, _distance, from) => {
        // Whole-pixel jumps keep the sand crisp instead of blurring it.
        const x = Math.floor(dab.x + dx);
        const y = Math.floor(dab.y + dy);
        from[0] = dx + Math.round((hash2(x, y, seed) * 2 - 1) * jump);
        from[1] = dy + Math.round((hash2(x, y, seed + 1) * 2 - 1) * jump);
        return true;
      });
    });
  },
});
