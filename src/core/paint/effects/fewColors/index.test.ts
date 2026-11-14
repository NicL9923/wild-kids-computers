import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import fewColors from './index.ts';

describe('few colors effect', () => {
  it('rounds the colors under the brush to a few bold ones', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, fewColors, testSettings({ size: 44 }), wave());
    expectGolden('effect-fewColors', doc.paint);
  });
});
