import { trailStroke } from '../../dab.ts';
import { EMPTY_RECT } from '../../rect.ts';
import { defineEffect } from '../../types.ts';
import { warpDab } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.15;
/** How far the center of a dab drags the picture, as a fraction of the spacing. Under 1, so the drag lags the pointer a little. */
const DRAG = 0.8;

/** Drags the picture along with the pointer, like pulling wet paint with a spoon. The pixels stay sharp. */
export default defineEffect({
  id: 'tug',
  order: 3,
  group: 'distort',
  stroke: (ctx) => {
    const spacing = ctx.settings.size * SPACING;
    const shift = spacing * DRAG;
    return trailStroke(ctx, spacing, (dab) => {
      // The first dab has no direction of travel yet.
      if (dab.index === 0) return EMPTY_RECT;
      const radius = dab.size / 2;
      return warpDab(ctx.doc, ctx.change, { x: dab.x, y: dab.y, radius, reach: shift }, (dx, dy, distance, from) => {
        const t = 1 - distance / radius;
        const pull = shift * t * t * (3 - 2 * t);
        from[0] = dx - dab.dirX * pull;
        from[1] = dy - dab.dirY * pull;
        return true;
      });
    });
  },
});
