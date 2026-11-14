import { hsv } from '../../color.ts';
import { trailStroke } from '../../dab.ts';
import { Path } from '../../path.ts';
import { createRandom, mixSeed, type Random } from '../../random.ts';
import { Scatter } from '../../scatter.ts';
import { defineEffect } from '../../types.ts';

const SEGMENTS = 8;

/**
 * One blade of grass from its root at (x, y), growing up: height tall, bent sideways by lean at
 * the tip, width wide at the root and pointed at the top.
 */
function bladePath(x: number, y: number, height: number, lean: number, width: number): Path {
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    // The middle of the blade bends more and more toward the tip: a parabola.
    const mx = x + lean * t * t;
    const my = y - height * t;
    // The normal to the direction (2 lean t, -height), scaled to half the width here.
    const tx = 2 * lean * t;
    const ty = -height;
    const length = Math.sqrt(tx * tx + ty * ty);
    const half = (width / 2) * (1 - t);
    const nx = (-ty / length) * half;
    const ny = (tx / length) * half;
    left.push(mx - nx, my - ny);
    right.push(mx + nx, my + ny);
  }
  const points = [...left];
  for (let i = right.length - 2; i >= 0; i -= 2) points.push(right[i] ?? 0, right[i + 1] ?? 0);
  return new Path().polygon(points);
}

function bladeColor(random: Random) {
  return hsv(random.range(0.24, 0.36), random.range(0.6, 0.85), random.range(0.45, 0.8));
}

/** Grows tufts of grass wherever the brush goes, each blade leaning its own way. The stroke seed shapes them. */
export default defineEffect({
  id: 'grassTufts',
  order: 6,
  group: 'paint-on',
  stroke: (ctx) => {
    const scatter = new Scatter(ctx.doc, ctx.change);
    return trailStroke(ctx, ctx.settings.size * 0.3, (dab) => {
      const random = createRandom(mixSeed(dab.seed, dab.index));
      const blades = 3 + random.int(3);
      for (let n = 0; n < blades; n++) {
        const x = dab.x + random.range(-0.45, 0.45) * dab.size;
        const y = dab.y + random.range(0, 0.35) * dab.size;
        const height = dab.size * random.range(0.55, 1.05);
        const lean = height * random.range(-0.45, 0.45);
        const width = Math.max(2, dab.size * random.range(0.08, 0.13));
        scatter.fill(bladePath(x, y, height, lean, width), bladeColor(random));
      }
      return scatter.takeChanged();
    });
  },
});
