import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import grayWash from './index.ts';

describe('gray wash effect', () => {
  it('turns the colors under the brush to grays', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, grayWash, testSettings({ size: 44 }), wave());
    expectGolden('effect-grayWash', doc.paint);
  });
});
