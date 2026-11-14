import { discCoverage } from '../dab.ts';
import { defineTip } from '../types.ts';

/** A row of separate dots with gaps between them. */
export default defineTip({
  id: 'dotted',
  order: 8,
  spacing: 1.6,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    canvas.disc(dab.x, dab.y, radius, (distance) => discCoverage(radius, distance), r, g, b, a);
  },
});
