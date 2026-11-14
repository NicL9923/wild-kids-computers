import { describe, expect, it } from 'vitest';
import { PAPER } from '../../document.ts';
import { drawStroke, expectGolden, newPicture, paintBands, testSettings, wave } from '../../testing/golden.ts';
import chalk from '../../tips/chalk.ts';
import eraser from './index.ts';

describe('eraser tool', () => {
  it('paints paper back along the stroke', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, eraser, testSettings({ size: 16 }), wave());
    expectGolden('tool-eraser', doc.paint);
  });

  it('erases with a solid round tip and paper color, whatever brush tip and color are chosen', () => {
    const { doc, history } = newPicture();
    paintBands(doc);
    drawStroke(history, eraser, testSettings({ size: 16, tip: chalk }), [{ x: 100, y: 60 }]);
    const center = (60 * doc.width + 100) * 4;
    expect([...doc.paint.data.subarray(center, center + 4)]).toEqual([PAPER.r, PAPER.g, PAPER.b, 255]);
  });
});
