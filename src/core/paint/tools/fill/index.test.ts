import { describe, expect, it } from 'vitest';
import { rgba } from '../../color.ts';
import { flattenDocument } from '../../document.ts';
import { cos, sin, TAU } from '../../math.ts';
import { startStroke } from '../../session.ts';
import { BLUE, drawStroke, expectGolden, loadFixture, newPicture, ORANGE, testSettings } from '../../testing/golden.ts';
import line from '../line/index.ts';
import brush from '../brush/index.ts';
import { FILL_TOLERANCE } from './floodFill.ts';
import fill from './index.ts';

const at = (x: number, y: number) => [{ x, y }];

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4;
  return [...data.subarray(i, i + 4)];
}

describe('fill tool', () => {
  it('fills the areas of a coloring page with solid, gradient, and pattern fills inside the lines', () => {
    const { doc, history } = newPicture();
    history.replaceDocument(doc.paint, loadFixture('coloring-page'));
    drawStroke(history, fill, testSettings({ color: ORANGE }), at(52, 62));
    drawStroke(
      history,
      fill,
      testSettings({
        color: rgba(250, 220, 60),
        fill: { kind: 'gradient', to: rgba(230, 70, 40), direction: 'vertical' },
      }),
      at(140, 80),
    );
    drawStroke(
      history,
      fill,
      testSettings({ color: BLUE, fill: { kind: 'pattern', pattern: 'dots', background: rgba(200, 230, 255) } }),
      at(5, 5),
    );
    drawStroke(
      history,
      fill,
      testSettings({
        color: rgba(70, 170, 90),
        fill: { kind: 'gradient', to: rgba(255, 255, 255), direction: 'radial' },
      }),
      at(185, 115),
    );
    expect(doc.mask).not.toBeNull();
    expectGolden('tool-fill-coloring-page', flattenDocument(doc));
  });

  it('fills up to a painted edge without a pale fringe, with stripes and checks', () => {
    const { doc, history } = newPicture();
    const ring = Array.from({ length: 33 }, (_, i) => {
      const t = (i / 32) * TAU;
      return { x: 60 + 40 * cos(t), y: 62 + 40 * sin(t) };
    });
    drawStroke(history, brush, testSettings({ size: 5 }), ring);
    drawStroke(
      history,
      fill,
      testSettings({ color: ORANGE, fill: { kind: 'pattern', pattern: 'stripes', background: rgba(255, 240, 200) } }),
      at(60, 62),
    );
    drawStroke(
      history,
      fill,
      testSettings({
        color: rgba(120, 80, 200),
        fill: { kind: 'pattern', pattern: 'checks', background: rgba(235, 225, 255) },
      }),
      at(150, 20),
    );
    expectGolden('tool-fill-painted-edge', doc.paint);
  });

  it('fills the zigzag pattern', () => {
    const { doc, history } = newPicture();
    drawStroke(
      history,
      fill,
      testSettings({ fill: { kind: 'pattern', pattern: 'zigzag', background: rgba(255, 255, 255) } }),
      at(5, 5),
    );
    expectGolden('tool-fill-zigzag', doc.paint);
  });

  it('stops at a thin painted line, even a diagonal one', () => {
    const { doc, history } = newPicture();
    drawStroke(history, line, testSettings({ size: 1.5, color: rgba(0, 0, 0) }), [
      { x: 20, y: 0 },
      { x: 180, y: 125 },
    ]);
    drawStroke(history, fill, testSettings({ color: ORANGE }), at(150, 20));
    // Above the line is orange. Below it is still paper.
    expect(pixel(doc.paint.data, doc.width, 150, 20)).toEqual([ORANGE.r, ORANGE.g, ORANGE.b, 255]);
    expect(pixel(doc.paint.data, doc.width, 40, 100)).toEqual([255, 255, 255, 255]);
  });

  it('fills pixels within the tolerance of the clicked color and stops beyond it', () => {
    const { doc, history } = newPicture();
    // Two gray patches: one just inside the tolerance from white, one just outside.
    const near = 255 - Math.floor(FILL_TOLERANCE / 3);
    const far = 255 - Math.floor(FILL_TOLERANCE / 3) - 1;
    for (const [x0, gray] of [
      [20, near],
      [120, far],
    ] as const) {
      for (let y = 40; y < 80; y++) {
        for (let x = x0; x < x0 + 40; x++) doc.paint.data.set([gray, gray, gray, 255], (y * doc.width + x) * 4);
      }
    }
    drawStroke(history, fill, testSettings({ color: ORANGE }), at(5, 5));
    expect(pixel(doc.paint.data, doc.width, 40, 60)).toEqual([ORANGE.r, ORANGE.g, ORANGE.b, 255]);
    expect(pixel(doc.paint.data, doc.width, 140, 60)).toEqual([far, far, far, 255]);
  });

  it('changes nothing and adds no undo step for a solid fill in the color already there', () => {
    const { doc, history } = newPicture();
    drawStroke(history, fill, testSettings({ color: ORANGE }), at(10, 10));
    const filled = doc.paint.data.slice();
    const stroke = startStroke(history, fill, testSettings({ color: ORANGE }));
    expect(stroke.begin({ x: 100, y: 100 }).width).toBe(0);
    stroke.end();
    expect(doc.paint.data).toEqual(filled);
    expect(history.undoSteps).toBe(1);
  });

  it.each([
    ['on a line of the coloring page', 112, 80],
    ['off the canvas', -3, 40],
  ])('changes nothing when the click lands %s', (_where, x, y) => {
    const { doc, history } = newPicture();
    history.replaceDocument(doc.paint, loadFixture('coloring-page'));
    const before = doc.paint.data.slice();
    drawStroke(history, fill, testSettings({ color: ORANGE }), at(x, y));
    expect(doc.paint.data).toEqual(before);
    expect(history.undoSteps).toBe(1);
  });

  it('puts the pixels back on cancel', () => {
    const { doc, history } = newPicture();
    const before = doc.paint.data.slice();
    const stroke = startStroke(history, fill, testSettings({ color: ORANGE }));
    stroke.begin({ x: 10, y: 10 });
    stroke.cancel();
    expect(doc.paint.data).toEqual(before);
    expect(history.canUndo).toBe(false);
  });
});
