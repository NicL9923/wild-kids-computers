import { discCoverage, forEachInDisc } from '../dab.ts';
import { cos, sin, TAU } from '../math.ts';
import { createRandom, mixSeed } from '../random.ts';
import { defineTip } from '../types.ts';

/** A spray can: fine droplets scattered over the brush area. The stroke seed places them. */
export default defineTip({
  id: 'spray',
  order: 6,
  spacing: 0.3,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    const random = createRandom(mixSeed(dab.seed, dab.index));
    const drops = Math.max(4, Math.round(radius * 1.6));
    for (let n = 0; n < drops; n++) {
      // sqrt keeps the drops evenly spread over the area instead of bunched at the center.
      const reach = radius * Math.sqrt(random.next());
      const angle = random.next() * TAU;
      const cx = dab.x + reach * cos(angle);
      const cy = dab.y + reach * sin(angle);
      const dropRadius = random.range(0.6, 1.5);
      forEachInDisc(cx, cy, dropRadius, (x, y, distance) => {
        canvas.put(x, y, discCoverage(dropRadius, distance), r, g, b, a);
      });
    }
  },
});
