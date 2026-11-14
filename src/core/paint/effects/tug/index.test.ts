import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import tug from './index.ts';

describe('tug effect', () => {
  it('drags the picture along with the pointer', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, tug, testSettings({ size: 40 }), wave());
    expectGolden('effect-tug', doc.paint);
  });
});
