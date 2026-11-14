import { discCoverage } from '../dab.ts';
import { defineTip } from '../types.ts';

/** A see-through felt marker. One stroke stays even. Crossing another stroke shows through. */
export default defineTip({
  id: 'marker',
  order: 3,
  spacing: 0.1,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    const alpha = Math.round((a * 150) / 255);
    canvas.disc(dab.x, dab.y, radius, (distance) => discCoverage(radius, distance), r, g, b, alpha);
  },
});
