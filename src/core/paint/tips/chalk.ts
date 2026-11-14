import { discCoverage, forEachInDisc } from '../dab.ts';
import { clamp } from '../math.ts';
import { hash2, valueNoise } from '../random.ts';
import { defineTip } from '../types.ts';

/**
 * Dusty chalk: soft, powdery, and broken, with a ragged edge. The grain belongs to the paper,
 * so it stays put along the stroke instead of smearing.
 */
export default defineTip({
  id: 'chalk',
  order: 4,
  spacing: 0.15,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const { r, g, b, a } = dab.color;
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      const grain = valueNoise(x, y, 3, 11) * 0.65 + hash2(x, y, 12) * 0.35;
      const amount = clamp((grain - 0.3) * 2.2, 0, 1);
      if (amount === 0) return;
      const edge = discCoverage(radius * (0.75 + 0.25 * valueNoise(x, y, 6, 13)), distance);
      canvas.put(x, y, Math.round(edge * amount * 0.8), r, g, b, a);
    });
  },
});
