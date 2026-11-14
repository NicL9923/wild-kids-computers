import { smoothstep } from '../math.ts';
import { defineTip } from '../types.ts';

/** An airbrush-like round brush that fades out from a solid center. */
export default defineTip({
  id: 'soft',
  order: 2,
  spacing: 0.08,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    const solid = radius * 0.25;
    canvas.disc(
      dab.x,
      dab.y,
      radius,
      (distance) => Math.round((1 - smoothstep(solid, radius, distance)) * 255),
      r,
      g,
      b,
      a,
    );
  },
});
