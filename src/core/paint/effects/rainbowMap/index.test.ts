import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import rainbowMap from './index.ts';

describe('rainbow map effect', () => {
  it('paints a rainbow by lightness under the brush', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, rainbowMap, testSettings({ size: 44 }), wave());
    expectGolden('effect-rainbowMap', doc.paint);
  });
});
