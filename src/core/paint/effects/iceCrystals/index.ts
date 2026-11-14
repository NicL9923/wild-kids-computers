import { rgba } from '../../color.ts';
import { trailStroke } from '../../dab.ts';
import { cos, sin, TAU } from '../../math.ts';
import { createRandom, mixSeed } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const EDGE = rgba(70, 135, 215);
const ICE = rgba(245, 250, 255);
const ARMS = 6;

/** The six arms of one crystal, each with a pair of side branches, as polylines. */
function crystalLines(cx: number, cy: number, radius: number, spin: number): number[][] {
  const lines: number[][] = [];
  for (let k = 0; k < ARMS; k++) {
    const angle = spin + (k * TAU) / ARMS;
    const ux = cos(angle);
    const uy = sin(angle);
    lines.push([cx, cy, cx + ux * radius, cy + uy * radius]);
    // Side branches leave the arm at 60 degrees, about halfway out.
    const bx = cx + ux * radius * 0.55;
    const by = cy + uy * radius * 0.55;
    const branch = radius * 0.32;
    for (const side of [-1, 1]) {
      const turn = angle + (side * TAU) / 6;
      lines.push([bx, by, bx + cos(turn) * branch, by + sin(turn) * branch]);
    }
  }
  return lines;
}

/** Scatters six-armed snow crystals along the brush, white with an icy blue edge. The stroke seed places them. */
export default defineEffect({
  id: 'iceCrystals',
  order: 5,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.55, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      const reach = (dab.size / 2) * Math.sqrt(random.next());
      const direction = random.next() * TAU;
      const cx = dab.x + reach * cos(direction);
      const cy = dab.y + reach * sin(direction);
      const radius = Math.max(4, (dab.size / 2) * random.range(0.45, 0.85));
      const lines = crystalLines(cx, cy, radius, random.next() * TAU);
      const width = Math.max(1, radius * 0.1);
      // The blue edge first, then the white core over it, so the crystal shows on any color.
      scatter.line(lines, width + 2, EDGE);
      scatter.line(lines, width, ICE);
      return scatter.takeChanged();
    });
  },
});
