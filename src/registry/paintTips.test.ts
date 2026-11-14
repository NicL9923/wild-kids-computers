import { describe, it } from 'vitest';
import { rgba } from '../core/paint/color.ts';
import brush from '../core/paint/tools/brush/index.ts';
import { drawStroke, expectGolden, newPicture, ORANGE, testSettings, wave } from '../core/paint/testing/golden.ts';
import { brushTips } from './paint.ts';

/**
 * One golden per brush tip, driven by the registry, so a new tip fails here until its golden
 * exists. Each picture is a thick wave and a thinner stroke crossing it in a second color, which
 * shows the tip's edge, texture, spacing, and how it overlaps paint.
 */
describe.each(brushTips.map((tip) => [tip.id, tip] as const))('brush tip %s', (id, tip) => {
  it('paints a wave and a crossing stroke', () => {
    const { doc, history } = newPicture();
    drawStroke(history, brush, testSettings({ tip, size: 22, color: rgba(40, 110, 200), seed: 3 }), wave());
    drawStroke(history, brush, testSettings({ tip, size: 12, color: ORANGE, seed: 4 }), [
      { x: 24, y: 16 },
      { x: 176, y: 108 },
    ]);
    expectGolden(`tip-${id}`, doc.paint);
  });
});
