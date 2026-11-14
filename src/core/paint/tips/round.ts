import { discCoverage, forEachInDisc } from '../dab.ts';
import { defineTip } from '../types.ts';

/** A solid round brush with a smooth edge. */
export default defineTip({
  id: 'round',
  order: 1,
  spacing: 0.1,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      canvas.put(x, y, discCoverage(radius, distance), r, g, b, a);
    });
  },
});
