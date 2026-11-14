import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, paintBands, testSettings, wave } from '../../testing/golden.ts';
import hueShift from './index.ts';

describe('hue shift effect', () => {
  it('moves colors a third of the way around the wheel under the brush, and leaves gray alone', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, hueShift, testSettings({ size: 30 }), wave());
    expectGolden('effect-hueShift', doc.paint);
  });

  it('shifts each pixel once per stroke, even where the stroke crosses itself', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    const back = [
      { x: 10, y: 60 },
      { x: 30, y: 60 },
    ];
    drawStroke(history, hueShift, testSettings({ size: 20 }), [...back, back[0] ?? { x: 0, y: 0 }]);
    // Red (230, 60, 60) moves to green, not on to blue.
    const i = (60 * doc.width + 20) * 4;
    expect([...doc.paint.data.subarray(i, i + 3)]).toEqual([60, 230, 60]);
  });
});
