import { hsv } from '../../color.ts';
import { DabCanvas, trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { Path } from '../../path.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { rasterizePath } from '../../raster.ts';
import { defineEffect } from '../../types.ts';

/** Bright confetti hues, in turns around the color wheel. */
const HUES = [0, 0.08, 0.15, 0.33, 0.55, 0.75, 0.88];
const PIECES_PER_DAB = 3;

/** Scatters bright confetti pieces around the brush. The stroke seed decides where each one lands. */
export default defineEffect({
  id: 'confetti',
  order: 1,
  group: 'paint-on',
  stroke: (ctx) => {
    const canvas = new DabCanvas(ctx.doc, ctx.change);
    const clip = { x: 0, y: 0, width: ctx.doc.width, height: ctx.doc.height };
    return trailStroke(
      ctx,
      ctx.settings.size * 0.5,
      (dab) => {
        const random = createRandom(mixSeed(dab.seed, dab.index));
        const radius = dab.size / 2;
        for (let n = 0; n < PIECES_PER_DAB; n++) {
          const reach = radius * Math.sqrt(random.next());
          const direction = random.next() * TAU;
          const cx = dab.x + reach * cos(direction);
          const cy = dab.y + reach * sin(direction);
          const color = hsv(HUES[random.int(HUES.length)] ?? 0, 0.8, 0.95);
          const piece = Math.max(2, dab.size / 10) * random.range(0.7, 1.3);
          const spin = random.next() * TAU;
          const path = new Path();
          if (random.next() < 0.3) {
            path.ellipse(cx, cy, piece / 2, piece / 2);
          } else {
            // A paper strip, twice as long as it is wide, turned by spin.
            const ux = cos(spin) * piece;
            const uy = sin(spin) * piece;
            const vx = -uy / 2;
            const vy = ux / 2;
            path.polygon([
              cx - ux - vx,
              cy - uy - vy,
              cx + ux - vx,
              cy + uy - vy,
              cx + ux + vx,
              cy + uy + vy,
              cx - ux + vx,
              cy - uy + vy,
            ]);
          }
          rasterizePath(path, clip, (x, y, coverage) => canvas.put(x, y, coverage, color.r, color.g, color.b));
        }
        return canvas.takeChanged();
      },
      () => canvas.finish(),
    );
  },
});
