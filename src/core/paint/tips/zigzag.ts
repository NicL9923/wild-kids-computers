import { mixColors } from '../color.ts';
import { discCoverage, forEachInDisc } from '../dab.ts';
import { partnerTone, patternCoverage } from '../patterns.ts';
import { defineTip } from '../types.ts';

/** A round brush that paints zigzag in the chosen color and a second tone. */
export default defineTip({
  id: 'zigzag',
  order: 12,
  spacing: 0.1,
  paint(canvas, dab) {
    const radius = dab.size / 2;
    const partner = partnerTone(dab.color);
    forEachInDisc(dab.x, dab.y, radius, (x, y, distance) => {
      const tone = mixColors(partner, dab.color, patternCoverage('zigzag', x, y));
      canvas.put(x, y, discCoverage(radius, distance), tone.r, tone.g, tone.b, dab.color.a);
    });
  },
});
