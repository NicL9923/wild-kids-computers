import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintSpectrum } from '../../testing/pictures.ts';
import chunky from './index.ts';

describe('chunky effect', () => {
  it('turns the picture under the brush into blocks of its average colors', () => {
    const { doc, history } = newPicture();
    paintSpectrum(doc);
    drawStroke(history, chunky, testSettings({ size: 50 }), wave());
    expectGolden('effect-chunky', doc.paint);
  });
});
