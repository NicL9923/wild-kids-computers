import { rgba } from '../../color.ts';
import { discCoverage, trailStroke } from '../../dab.ts';
import { atan2, cos, sin, TAU } from '../../math.ts';
import { Path } from '../../path.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const WATER = rgba(45, 125, 215, 190);
const DEEP = rgba(25, 80, 170, 150);
const SHINE = rgba(255, 255, 255, 240);
const ARC_POINTS = 14;
/** How far the tip sits above the center, in radii. */
const TIP = 2.3;

/**
 * A raindrop: round at the bottom, pointed at the top. The sides run from the tip along the
 * tangents of the round part, so the outline is smooth where they meet.
 */
function dropPath(cx: number, cy: number, radius: number): Path {
  // The tangent from the tip touches the circle at the angle whose cosine is radius / tip,
  // measured from straight up.
  const c = 1 / TIP;
  const s = Math.sqrt(1 - c * c);
  const sweep = TAU - 2 * atan2(s, c);
  const points = [cx, cy - radius * TIP];
  for (let i = 0; i <= ARC_POINTS; i++) {
    // Turn the right tangent point clockwise on screen, under the bottom, to the left one.
    const turn = (sweep * i) / ARC_POINTS;
    const ct = cos(turn);
    const st = sin(turn);
    points.push(cx + radius * (s * ct + c * st), cy + radius * (s * st - c * ct));
  }
  return new Path().polygon(points);
}

/** Drips glossy blue raindrops along the brush. The stroke seed places them. */
export default defineEffect({
  id: 'dewDrops',
  order: 4,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.45, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      for (let n = 0; n < 2; n++) {
        const reach = (dab.size / 2) * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const cx = dab.x + reach * cos(direction);
        const cy = dab.y + reach * sin(direction);
        const radius = Math.max(2, dab.size * random.range(0.07, 0.13));
        scatter.fill(dropPath(cx, cy, radius), WATER);
        // A darker crescent low on the drop and a bright shine high on it make it look wet and round.
        const deep = radius * 0.75;
        scatter.spot(cx + radius * 0.2, cy + radius * 0.25, deep, (d) => discCoverage(deep, d) * 0.6, DEEP);
        const shine = Math.max(0.8, radius * 0.28);
        scatter.spot(cx - radius * 0.35, cy - radius * 0.3, shine, (d) => discCoverage(shine, d), SHINE);
      }
      return scatter.takeChanged();
    });
  },
});
