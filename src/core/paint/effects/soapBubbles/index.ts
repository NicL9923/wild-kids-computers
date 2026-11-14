import { rgba } from '../../color.ts';
import { discCoverage, trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const FILM = rgba(150, 205, 250, 55);
const SHINE = rgba(255, 255, 255, 235);
/** The rim shimmers from sky blue on the left to pink on the right, like a soap film. */
const RIM_LEFT = rgba(60, 150, 230, 210);
const RIM_RIGHT = rgba(220, 90, 200, 210);

/** Blows see-through soap bubbles of different sizes along the brush. The stroke seed places them. */
export default defineEffect({
  id: 'soapBubbles',
  order: 3,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.6, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      const count = random.next() < 0.5 ? 1 : 2;
      for (let n = 0; n < count; n++) {
        const reach = (dab.size / 2) * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const cx = dab.x + reach * cos(direction);
        const cy = dab.y + reach * sin(direction);
        const radius = Math.max(3, (dab.size / 2) * random.range(0.25, 0.6));
        const rim = Math.max(1.2, radius * 0.11);
        scatter.spot(cx, cy, radius, (d) => discCoverage(radius, d), FILM);
        // Two half rings, so the rim color changes across the bubble without any per-pixel angle.
        scatter.spot(cx, cy, radius, (d) => discCoverage(radius, d) - discCoverage(radius - rim, d), RIM_LEFT);
        scatter.spot(
          cx + radius * 0.12,
          cy - radius * 0.05,
          radius * 0.92,
          (d) => (discCoverage(radius * 0.92, d) - discCoverage(radius * 0.92 - rim, d)) * 0.7,
          RIM_RIGHT,
        );
        const shine = radius * 0.22;
        scatter.spot(cx - radius * 0.4, cy - radius * 0.4, shine, (d) => discCoverage(shine, d), SHINE);
      }
      return scatter.takeChanged();
    });
  },
});
