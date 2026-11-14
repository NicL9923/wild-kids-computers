import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import shady from './index.ts';

describe('shady effect', () => {
  it('darkens the colors under the brush', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, shady, testSettings({ size: 44 }), wave());
    expectGolden('effect-shady', doc.paint);
  });
});
