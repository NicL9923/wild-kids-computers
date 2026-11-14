import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, paintBands, testSettings, wave } from '../../testing/golden.ts';
import fingerPaint from './index.ts';

describe('finger paint effect', () => {
  it('smears the colors along the stroke', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, fingerPaint, testSettings({ size: 30 }), wave());
    expectGolden('effect-fingerPaint', doc.paint);
  });
});
