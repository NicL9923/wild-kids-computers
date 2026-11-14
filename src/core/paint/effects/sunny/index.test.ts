import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import sunny from './index.ts';

describe('sunny effect', () => {
  it('lightens the colors under the brush', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, sunny, testSettings({ size: 44 }), wave());
    expectGolden('effect-sunny', doc.paint);
  });
});
