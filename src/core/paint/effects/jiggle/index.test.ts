import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings, wave } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import jiggle from './index.ts';

function paintWith(seed: number): Uint8ClampedArray {
  const { doc, history } = newPicture();
  paintChecks(doc);
  drawStroke(history, jiggle, testSettings({ size: 36, seed }), wave());
  return doc.paint.data;
}

describe('jiggle effect', () => {
  it('shakes the picture into sand under the brush', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, jiggle, testSettings({ size: 36 }), wave());
    expectGolden('effect-jiggle', doc.paint);
  });

  it('gives the same pixels for the same seed and different ones for another seed', () => {
    expect(paintWith(7)).toEqual(paintWith(7));
    expect(paintWith(7)).not.toEqual(paintWith(8));
  });
});
