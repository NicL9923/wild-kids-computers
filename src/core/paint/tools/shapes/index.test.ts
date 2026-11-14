import { describe, expect, it } from 'vitest';
import { drawStroke, expectGolden, newPicture, ORANGE, testSettings } from '../../testing/golden.ts';
import { SHAPE_KINDS } from '../../types.ts';
import shapes from './index.ts';

/** Draws every shape kind in a 5 by 2 grid of 40 by 62 cells. */
function drawAll(style: 'filled' | 'outline'): Uint8ClampedArray {
  const { doc, history } = newPicture();
  SHAPE_KINDS.forEach((kind, i) => {
    const x = (i % 5) * 40 + 4;
    const y = Math.floor(i / 5) * 62 + 6;
    const color = i % 2 === 0 ? undefined : ORANGE;
    drawStroke(history, shapes, testSettings({ size: 3, shape: { kind, style }, ...(color ? { color } : {}) }), [
      { x, y },
      { x: x + 32, y: y + 50 },
    ]);
  });
  return doc.paint.data;
}

describe('shapes tool', () => {
  it.each(['filled', 'outline'] as const)('draws every shape %s', (style) => {
    const data = drawAll(style);
    expectGolden(`tool-shapes-${style}`, { width: 200, height: 125, data });
  });

  it('draws a shape the same way whichever corner the stroke starts from', () => {
    const forward = newPicture();
    drawStroke(forward.history, shapes, testSettings({ shape: { kind: 'star', style: 'filled' } }), [
      { x: 20, y: 20 },
      { x: 120, y: 100 },
    ]);
    const backward = newPicture();
    drawStroke(backward.history, shapes, testSettings({ shape: { kind: 'star', style: 'filled' } }), [
      { x: 120, y: 100 },
      { x: 20, y: 20 },
    ]);
    expect(backward.doc.paint.data).toEqual(forward.doc.paint.data);
  });

  it.each(SHAPE_KINDS)('paints nothing for a filled %s with no width or height', (kind) => {
    const { doc, history } = newPicture();
    const blank = doc.paint.data.slice();
    drawStroke(history, shapes, testSettings({ shape: { kind, style: 'filled' } }), [
      { x: 50, y: 50 },
      { x: 50, y: 90 },
    ]);
    expect(doc.paint.data).toEqual(blank);
    expect(history.canUndo).toBe(false);
  });
});
