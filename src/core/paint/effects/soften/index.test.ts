import { describe, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import soften from './index.ts';

describe('soften effect', () => {
  it('blurs the picture under the brush', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, soften, testSettings({ size: 36 }), wave());
    expectGolden('effect-soften', doc.paint);
  });
});
