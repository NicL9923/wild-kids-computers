import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, testSettings } from '../../testing/golden.ts';
import { paintChecks } from '../../testing/pictures.ts';
import squeeze from './index.ts';

describe('squeeze effect', () => {
  it('squeezes the picture toward the middle under a click and along a stroke', () => {
    const { doc, history } = newPicture();
    paintChecks(doc);
    drawStroke(history, squeeze, testSettings({ size: 80 }), [{ x: 55, y: 62 }]);
    drawStroke(history, squeeze, testSettings({ size: 50 }), [
      { x: 125, y: 35 },
      { x: 175, y: 90 },
    ]);
    expectGolden('effect-squeeze', doc.paint);
  });

  // Pixel 1 from an edge reads from about 1.2 pixels past it, which clamps to the edge.
  it.each([
    { edge: 'left', at: { x: 10, y: 60 }, check: { x: 1, y: 60 } },
    { edge: 'right', at: { x: 190, y: 60 }, check: { x: 198, y: 60 } },
    { edge: 'top', at: { x: 100, y: 10 }, check: { x: 100, y: 1 } },
    { edge: 'bottom', at: { x: 100, y: 115 }, check: { x: 100, y: 123 } },
  ])('pulls the edge color in at the $edge edge of the canvas instead of leaving a gap', ({ at, check }) => {
    const { doc, history } = newPicture();
    // White paper with a red frame one pixel wide.
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (x === 0 || y === 0 || x === doc.width - 1 || y === doc.height - 1) {
          doc.paint.data.set([230, 60, 60, 255], (y * doc.width + x) * 4);
        }
      }
    }
    drawStroke(history, squeeze, testSettings({ size: 60 }), [at]);
    const i = (check.y * doc.width + check.x) * 4;
    expect([...doc.paint.data.subarray(i, i + 4)]).toEqual([230, 60, 60, 255]);
  });
});
