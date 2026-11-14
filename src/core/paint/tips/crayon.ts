import { discCoverage, forEachInDisc } from '../dab.ts';
import { hash2 } from '../random.ts';
import { defineTip } from '../types.ts';

/** A wax crayon: mostly solid, with slanted streaks and small white flecks where the paper shows. */
export default defineTip({
  id: 'crayon',
  order: 5,
  spacing: 0.12,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      // Streaks run along a slant: each 3 px wide slanted lane has its own strength.
      const lane = hash2(Math.floor((x + y * 2) / 3), 0, 21);
      const fleck = hash2(x, y, 22);
      if (fleck < 0.12) return;
      const strength = lane < 0.3 ? 0.55 : 1;
      const edge = discCoverage(radius * (0.9 + 0.1 * lane), distance);
      canvas.put(x, y, Math.round(edge * strength), r, g, b, a);
    });
  },
});
