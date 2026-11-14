import { hsv } from '../../color.ts';
import { trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { Path } from '../../path.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const OUTLINE_POINTS = 12;

/** A leaf pointed at both ends, from u = -length to u = length in local coordinates, turned by spin. */
function leafPath(cx: number, cy: number, length: number, spin: number): Path {
  const ux = cos(spin);
  const uy = sin(spin);
  const points: number[] = [];
  // Down one side and back along the other: half width is 0.45 length times (1 - u squared).
  for (let side = 1; side >= -1; side -= 2) {
    for (let i = 0; i <= OUTLINE_POINTS; i++) {
      const u = side === 1 ? -1 + (2 * i) / OUTLINE_POINTS : 1 - (2 * i) / OUTLINE_POINTS;
      const along = u * length;
      const across = side * 0.45 * length * (1 - u * u);
      points.push(cx + along * ux - across * uy, cy + along * uy + across * ux);
    }
  }
  return new Path().polygon(points);
}

/** Drops red, orange, and yellow leaves along the brush, each with a vein and a stem. The stroke seed scatters them. */
export default defineEffect({
  id: 'autumnLeaves',
  order: 8,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.5, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      const count = random.next() < 0.6 ? 1 : 2;
      for (let n = 0; n < count; n++) {
        const reach = (dab.size / 2) * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const cx = dab.x + reach * cos(direction);
        const cy = dab.y + reach * sin(direction);
        const length = Math.max(4, dab.size * random.range(0.2, 0.3));
        const spin = random.next() * TAU;
        const hue = random.range(0, 0.13);
        const value = random.range(0.8, 0.95);
        scatter.fill(leafPath(cx, cy, length, spin), hsv(hue, 0.85, value));
        // The vein runs down the middle and out past the base as the stem.
        const ux = cos(spin);
        const uy = sin(spin);
        scatter.line(
          [[cx + ux * length * 0.8, cy + uy * length * 0.8, cx - ux * length * 1.3, cy - uy * length * 1.3]],
          Math.max(1, length * 0.09),
          hsv(hue, 0.9, value * 0.55),
        );
      }
      return scatter.takeChanged();
    });
  },
});
