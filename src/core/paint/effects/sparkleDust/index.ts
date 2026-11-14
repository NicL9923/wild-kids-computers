import { rgba } from '../../color.ts';
import { trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

/** Gold, silver, pink, and aqua glitter. Each speck takes one and a random shine. */
const GLITTER = [rgba(232, 178, 30), rgba(150, 160, 178), rgba(236, 90, 170), rgba(40, 180, 210), rgba(150, 90, 220)];

/** Sprinkles shiny glitter specks around the brush, with a few that twinkle. The stroke seed scatters them. */
export default defineEffect({
  id: 'sparkleDust',
  order: 2,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.35, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      const radius = dab.size / 2;
      const specks = Math.max(4, Math.round(dab.size / 3));
      for (let n = 0; n < specks; n++) {
        const reach = radius * Math.sqrt(random.next());
        const direction = random.next() * TAU;
        const x = dab.x + reach * cos(direction);
        const y = dab.y + reach * sin(direction);
        const base = GLITTER[random.int(GLITTER.length)] ?? GLITTER[0];
        if (base === undefined) continue;
        // Shine lifts a speck toward white, so neighbors catch the light differently.
        const shine = random.next() * 0.45;
        const color = rgba(
          base.r + (255 - base.r) * shine,
          base.g + (255 - base.g) * shine,
          base.b + (255 - base.b) * shine,
        );
        const speck = Math.max(0.8, dab.size / 24) * random.range(0.6, 1.4);
        if (random.next() < 0.12) {
          // A twinkle: a thin four-pointed cross with a bright middle.
          const arm = speck * 3.5;
          const thin = Math.max(1, speck * 0.5);
          scatter.line(
            [
              [x - arm, y, x + arm, y],
              [x, y - arm, x, y + arm],
            ],
            thin,
            color,
          );
          scatter.spot(x, y, speck, (d) => (speck - d + 0.5) * 255, rgba(255, 250, 225));
        } else {
          scatter.spot(x, y, speck, (d) => (speck - d + 0.5) * 255, color);
        }
      }
      return scatter.takeChanged();
    });
  },
});
