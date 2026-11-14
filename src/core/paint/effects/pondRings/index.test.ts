import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, paintBands, testSettings } from '../../testing/golden.ts';
import pondRings from './index.ts';

describe('pond rings effect', () => {
  it('spreads rings under a click and along a stroke', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, pondRings, testSettings({ size: 100 }), [{ x: 55, y: 62 }]);
    drawStroke(history, pondRings, testSettings({ size: 50 }), [
      { x: 125, y: 30 },
      { x: 175, y: 95 },
    ]);
    expectGolden('effect-pondRings', doc.paint);
  });
});
