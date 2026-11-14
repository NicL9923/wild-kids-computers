import { rgba } from '../../color.ts';
import { discCoverage, trailStroke } from '../../dab.ts';
import { cos, sin, smoothstep, TAU } from '../../math.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const HALO = rgba(255, 190, 20, 235);
const LIGHT = rgba(255, 252, 205);

/** Lights up soft glowing fireflies along the brush, brightest in the middle. The stroke seed places them. */
export default defineEffect({
  id: 'fireflyGlow',
  order: 10,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.5, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      for (let n = 0; n < 2; n++) {
        const reach = (dab.size / 2) * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const cx = dab.x + reach * cos(direction);
        const cy = dab.y + reach * sin(direction);
        const glow = Math.max(3, dab.size * random.range(0.12, 0.22));
        // The halo fades smoothly to nothing at its edge, so it has no hard rim.
        scatter.spot(cx, cy, glow, (d) => smoothstep(glow, 0, d) * 255, HALO);
        const core = Math.max(1, glow * 0.28);
        scatter.spot(cx, cy, core, (d) => discCoverage(core, d), LIGHT);
      }
      return scatter.takeChanged();
    });
  },
});
