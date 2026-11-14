import { discCoverage, forEachInDisc } from '../dab.ts';
import { defineTip } from '../types.ts';

/** A row of separate dots with gaps between them. */
export default defineTip({
  id: 'dotted',
  order: 8,
  spacing: 1.6,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      canvas.put(x, y, discCoverage(radius, distance), r, g, b, a);
    });
  },
});
