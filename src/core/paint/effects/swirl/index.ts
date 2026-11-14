import { trailStroke } from '../../dab.ts';
import { blendPixel } from '../../color.ts';
import { cos, sin } from '../../math.ts';
import { clipRect, EMPTY_RECT, rectFromBounds } from '../../rect.ts';
import { sampleBilinear } from '../../sample.ts';
import { createSurface } from '../../surface.ts';
import { defineEffect } from '../../types.ts';

/** How far the center of a dab turns, in radians. The edge does not turn, so the swirl blends in. */
const TWIST = 1.4;

/** Twists the picture under the brush, like stirring paint with a finger. */
export default defineEffect({
  id: 'swirl',
  order: 1,
  group: 'distort',
  stroke: (ctx) =>
    trailStroke(ctx, ctx.settings.size * 0.2, (dab) => {
      const radius = dab.size / 2;
      const { doc, change } = ctx;
      const area = clipRect(
        rectFromBounds(dab.x - radius - 1, dab.y - radius - 1, dab.x + radius + 1, dab.y + radius + 1),
        doc.width,
        doc.height,
      );
      if (area.width <= 0 || area.height <= 0) return EMPTY_RECT;
      change.touch(area);
      // Sample from a copy of the area, so pixels already moved by this dab are not moved again.
      const before = createSurface(area.width, area.height);
      for (let y = 0; y < area.height; y++) {
        const start = ((area.y + y) * doc.width + area.x) * 4;
        before.data.set(doc.paint.data.subarray(start, start + area.width * 4), y * area.width * 4);
      }
      const sample = new Float64Array(4);
      const data = doc.paint.data;
      for (let y = area.y; y < area.y + area.height; y++) {
        for (let x = area.x; x < area.x + area.width; x++) {
          const dx = x + 0.5 - dab.x;
          const dy = y + 0.5 - dab.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= radius) continue;
          const falloff = 1 - distance / radius;
          const angle = TWIST * falloff * falloff;
          const c = cos(angle);
          const s = sin(angle);
          // Read from the point that turns onto this pixel.
          const sx = dab.x + dx * c + dy * s - area.x - 0.5;
          const sy = dab.y - dx * s + dy * c - area.y - 0.5;
          sampleBilinear(before, sx, sy, sample);
          const alpha = sample[3] ?? 0;
          if (alpha < 0.5) continue;
          const k = 255 / alpha;
          blendPixel(
            data,
            (y * doc.width + x) * 4,
            Math.round((sample[0] ?? 0) * k),
            Math.round((sample[1] ?? 0) * k),
            Math.round((sample[2] ?? 0) * k),
            Math.round(alpha),
          );
        }
      }
      return area;
    }),
});
