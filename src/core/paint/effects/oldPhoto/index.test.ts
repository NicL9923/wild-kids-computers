import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import oldPhoto from './index.ts';

describe('old photo effect', () => {
  it('turns the colors under the brush brown and cream', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, oldPhoto, testSettings({ size: 44 }), wave());
    expectGolden('effect-oldPhoto', doc.paint);
  });
});
