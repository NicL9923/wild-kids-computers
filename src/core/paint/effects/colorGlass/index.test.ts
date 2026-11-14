import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, ORANGE, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import colorGlass from './index.ts';

describe('color glass effect', () => {
  it('tints the picture under the brush with the chosen color', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, colorGlass, testSettings({ size: 44, color: ORANGE }), wave());
    expectGolden('effect-colorGlass', doc.paint);
  });
});
