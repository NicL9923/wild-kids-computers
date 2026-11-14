import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, paintBands, testSettings, wave } from '../../testing/golden.ts';
import swirl from './index.ts';

describe('swirl effect', () => {
  it('twists the picture under the brush', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, swirl, testSettings({ size: 44 }), wave());
    drawStroke(history, swirl, testSettings({ size: 60 }), [{ x: 160, y: 30 }]);
    expectGolden('effect-swirl', doc.paint);
  });

  it('leaves one flat color unchanged, since turning it changes nothing', () => {
    const { doc, history } = newPicture();
    const before = doc.paint.data.slice();
    drawStroke(history, swirl, testSettings({ size: 44 }), wave());
    expect(doc.paint.data).toEqual(before);
    expect(history.canUndo).toBe(false);
  });
});
