import { describe, expect, it } from 'vitest';
import { expectGolden, drawStroke, newPicture, testSettings, wave, ORANGE } from '../../testing/golden.ts';
import { isEmptyRect } from '../../rect.ts';
import { startStroke } from '../../session.ts';
import brush from './index.ts';

describe('brush tool', () => {
  it('paints a smooth wave and a crossing stroke', () => {
    const { doc, history } = newPicture();
    drawStroke(history, brush, testSettings({ size: 14 }), wave());
    drawStroke(history, brush, testSettings({ size: 8, color: ORANGE }), [
      { x: 30, y: 20 },
      { x: 170, y: 105 },
    ]);
    expectGolden('tool-brush', doc.paint);
  });

  it('paints the same pixels however the points are batched into moves', () => {
    const points = wave();
    const whole = newPicture();
    drawStroke(whole.history, brush, testSettings(), points);
    // The same path with every segment split at its midpoint, as coalesced events would report it.
    const split = newPicture();
    const dense = points.flatMap((p, i) => {
      const prev = points[i - 1];
      return prev === undefined ? [p] : [{ x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 }, p];
    });
    drawStroke(split.history, brush, testSettings(), dense);
    let differing = 0;
    for (let i = 0; i < whole.doc.paint.data.length; i++) {
      if (whole.doc.paint.data[i] !== split.doc.paint.data[i]) differing += 1;
    }
    expect(differing).toBe(0);
  });

  it('clips a stroke that leaves the canvas and reports only pixels on it', () => {
    const { doc, history } = newPicture();
    const stroke = startStroke(history, brush, testSettings({ size: 20 }));
    stroke.begin({ x: -50, y: 60 });
    const changed = stroke.move({ x: 260, y: 60 });
    stroke.end();
    expect(changed).toEqual({ x: 0, y: 50, width: doc.width, height: 20 });
    expect(history.undoSteps).toBe(1);
  });

  it('paints nothing for a stroke entirely off the canvas, and adds no undo step', () => {
    const { history } = newPicture();
    const stroke = startStroke(history, brush, testSettings());
    expect(isEmptyRect(stroke.begin({ x: -100, y: -100 }))).toBe(true);
    stroke.end();
    expect(history.canUndo).toBe(false);
  });

  it('puts every pixel back on cancel and adds no undo step', () => {
    const { doc, history } = newPicture();
    const blank = doc.paint.data.slice();
    const stroke = startStroke(history, brush, testSettings());
    stroke.begin({ x: 20, y: 20 });
    stroke.move({ x: 150, y: 90 });
    const repaint = stroke.cancel();
    expect(doc.paint.data).toEqual(blank);
    expect(repaint.width).toBeGreaterThan(0);
    expect(history.canUndo).toBe(false);
  });
});
