import { trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { defineEffect } from '../../types.ts';
import { warpDab } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.35;
/** Rings per radius. */
const RINGS = 3;
/**
 * How far the rings push pixels, as a fraction of the steepest push that keeps the picture from
 * folding over itself.
 */
const HEIGHT = 0.9;

/** How much a crest lightens and a trough darkens. */
const SHINE = 0.3;

/** Rings spread out under the brush like a pebble dropped in a pond. */
export default defineEffect({
  id: 'pondRings',
  order: 6,
  group: 'distort',
  stroke: (ctx) =>
    trailStroke(ctx, ctx.settings.size * SPACING, (dab) => {
      const radius = dab.size / 2;
      const wavelength = radius / RINGS;
      const amplitude = (HEIGHT * wavelength) / TAU;
      return warpDab(ctx.doc, ctx.change, { x: dab.x, y: dab.y, radius, reach: 0 }, (dx, dy, distance, from) => {
        if (distance === 0) return false;
        // Calm at the center and the edge, so the rings blend in.
        const t = distance / radius;
        const calm = 4 * t * (1 - t);
        const phase = (TAU * distance) / wavelength;
        const scale = 1 + (amplitude * calm * sin(phase)) / distance;
        from[0] = dx * scale;
        from[1] = dy * scale;
        // Crests catch the light and troughs fall into shade, which is how a ripple shows on water.
        from[2] = SHINE * calm * cos(phase);
        return true;
      });
    }),
});
