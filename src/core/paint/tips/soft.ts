import { forEachInDisc } from '../dab.ts';
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
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      const coverage = 1 - smoothstep(radius * 0.25, radius, distance);
      canvas.put(x, y, Math.round(coverage * 255), r, g, b, a);
    });
  },
});
