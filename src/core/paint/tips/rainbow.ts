import { hsv } from '../color.ts';
import { discCoverage } from '../dab.ts';
import { defineTip } from '../types.ts';

/** Pixels of stroke length for one trip around the color wheel. */
const RAINBOW_LENGTH = 360;

/** A round brush that walks through the rainbow as the stroke gets longer. It ignores the chosen color. */
export default defineTip({
  id: 'rainbow',
  order: 9,
  spacing: 0.1,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const color = hsv(dab.distance / RAINBOW_LENGTH, 0.85, 0.95);
    canvas.disc(
      dab.x,
      dab.y,
      radius,
      (distance) => discCoverage(radius, distance),
      color.r,
      color.g,
      color.b,
      dab.color.a,
    );
  },
});
