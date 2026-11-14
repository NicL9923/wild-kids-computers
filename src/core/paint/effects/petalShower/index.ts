import { hsv, rgba } from '../../color.ts';
import { trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { Path } from '../../path.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const OUTLINE_POINTS = 20;
const BLUSH = rgba(205, 60, 120, 110);

/**
 * A blossom petal: narrow at its base, round at its far end, with a small notch in the middle
 * of the far end. Built along the u axis in local coordinates, then turned by spin.
 */
function petalPath(cx: number, cy: number, length: number, spin: number): Path {
  const ux = cos(spin);
  const uy = sin(spin);
  const points: number[] = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    const t = (i * TAU) / OUTLINE_POINTS;
    const c = cos(t);
    // Wider toward the far end (c = 1) than at the base (c = -1).
    const across = sin(t) * length * 0.5 * (0.55 + 0.45 * ((c + 1) / 2));
    // Pull the tip of the far end in, which makes the notch.
    const notch = Math.max(0, 1 - Math.abs(t < Math.PI ? t : TAU - t) / 0.5) * length * 0.25;
    const along = c * length - notch;
    points.push(cx + along * ux - across * uy, cy + along * uy + across * ux);
  }
  return new Path().polygon(points);
}

/** Lets pink blossom petals drift down along the brush, each turned its own way. The stroke seed scatters them. */
export default defineEffect({
  id: 'petalShower',
  order: 7,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.4, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      for (let n = 0; n < 2; n++) {
        const reach = (dab.size / 2) * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const cx = dab.x + reach * cos(direction);
        const cy = dab.y + reach * sin(direction);
        const length = Math.max(3, dab.size * random.range(0.12, 0.2));
        const spin = random.next() * TAU;
        scatter.fill(petalPath(cx, cy, length, spin), hsv(random.range(0.9, 0.99), random.range(0.3, 0.6), 1));
        // A blush where the petal joined its flower.
        const blush = length * 0.3;
        const bx = cx - cos(spin) * length * 0.55;
        const by = cy - sin(spin) * length * 0.55;
        scatter.spot(bx, by, blush, (d) => (1 - d / blush) * 255, BLUSH);
      }
      return scatter.takeChanged();
    });
  },
});
