import { describe, expect, it } from 'vitest';
import { startStroke } from '../../session.ts';
import { drawStroke, expectGolden, newPicture, ORANGE, testSettings } from '../../testing/golden.ts';
import line from './index.ts';

describe('line tool', () => {
  it('draws straight lines with round ends, a dot for a click, and lines that leave the canvas', () => {
    const { doc, history } = newPicture();
    drawStroke(history, line, testSettings({ size: 2 }), [
      { x: 10, y: 10 },
      { x: 190, y: 30 },
    ]);
    drawStroke(history, line, testSettings({ size: 6 }), [
      { x: 20, y: 110 },
      { x: 120, y: 40 },
    ]);
    drawStroke(history, line, testSettings({ size: 14, color: ORANGE }), [
      { x: 60, y: 70 },
      { x: 260, y: 140 },
    ]);
    drawStroke(history, line, testSettings({ size: 18 }), [{ x: 165, y: 75 }]);
    expectGolden('tool-line', doc.paint);
  });

  it('leaves no trail while the end moves: the result matches a line drawn straight to the last point', () => {
    const wandering = newPicture();
    drawStroke(wandering.history, line, testSettings({ size: 5 }), [
      { x: 20, y: 20 },
      { x: 180, y: 20 },
      { x: 30, y: 110 },
      { x: 150, y: 100 },
    ]);
    const direct = newPicture();
    drawStroke(direct.history, line, testSettings({ size: 5 }), [
      { x: 20, y: 20 },
      { x: 150, y: 100 },
    ]);
    expect(wandering.doc.paint.data).toEqual(direct.doc.paint.data);
  });

  it('reports both the old and the new line as changed when the end moves', () => {
    const { history } = newPicture();
    const stroke = startStroke(history, line, testSettings({ size: 4 }));
    stroke.begin({ x: 10, y: 10 });
    stroke.move({ x: 50, y: 10 });
    const changed = stroke.move({ x: 10, y: 80 });
    stroke.end();
    // The old line reached x = 52 and the new one reaches y = 82.
    expect(changed.x + changed.width).toBeGreaterThanOrEqual(52);
    expect(changed.y + changed.height).toBeGreaterThanOrEqual(82);
  });
});
