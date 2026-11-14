import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import vivid from './index.ts';

describe('vivid effect', () => {
  it('makes the colors under the brush bolder', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, vivid, testSettings({ size: 44 }), wave());
    expectGolden('effect-vivid', doc.paint);
  });
});
