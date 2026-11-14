import { forEachInDisc } from '../dab.ts';
import { clamp } from '../math.ts';
import { defineTip } from '../types.ts';

// The nib is an ellipse slanted 45 degrees, so the line is thick one way and thin the other.
const SLANT = Math.SQRT1_2;

/** A flat pen nib. Lines get thick and thin as the stroke turns. */
export default defineTip({
  id: 'calligraphy',
  order: 7,
  spacing: 0.05,
  paint(canvas, dab) {
    const long = dab.size / 2;
    const short = Math.max(1, dab.size / 8);
    const { r, g, b, a } = dab.color;
    forEachInDisc(dab.x, dab.y, long, (x, y, _distance, dx, dy) => {
      const u = (dx + dy) * SLANT;
      const v = (dy - dx) * SLANT;
      // Distance to the ellipse edge, from the implicit function and its gradient.
      const f = (u * u) / (long * long) + (v * v) / (short * short) - 1;
      const gu = u / (long * long);
      const gv = v / (short * short);
      const gradient = 2 * Math.sqrt(gu * gu + gv * gv);
      const edge = gradient === 0 ? -1 : f / gradient;
      canvas.put(x, y, Math.round(clamp(0.5 - edge, 0, 1) * 255), r, g, b, a);
    });
  },
});
