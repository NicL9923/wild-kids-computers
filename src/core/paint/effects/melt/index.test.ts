import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import melt from './index.ts';

function paintWith(seed: number): Uint8ClampedArray {
  const { doc, history } = newPicture();
  paintChecks(doc);
  drawStroke(history, melt, testSettings({ size: 50, seed }), [
    { x: 20, y: 45 },
    { x: 180, y: 45 },
  ]);
  return doc.paint.data;
}

describe('melt effect', () => {
  it('makes the picture drip down under the brush', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, melt, testSettings({ size: 50 }), [
      { x: 20, y: 45 },
      { x: 180, y: 45 },
    ]);
    expectGolden('effect-melt', doc.paint);
  });

  it('gives the same pixels for the same seed and different ones for another seed', () => {
    expect(paintWith(7)).toEqual(paintWith(7));
    expect(paintWith(7)).not.toEqual(paintWith(8));
  });
});
