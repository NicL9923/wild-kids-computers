import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { createDocument } from './document.ts';
import { History } from './history.ts';
import { Path } from './path.ts';
import { EMPTY_RECT } from './rect.ts';
import { Scatter } from './scatter.ts';

const RED = rgba(200, 0, 0);

function setup(): { history: History; scatter: Scatter; pixel: (x: number, y: number) => number[] } {
  const doc = createDocument(20, 10);
  const history = new History(doc);
  const scatter = new Scatter(doc, history.begin());
  const pixel = (x: number, y: number): number[] => [
    ...doc.paint.data.subarray((y * 20 + x) * 4, (y * 20 + x) * 4 + 4),
  ];
  return { history, scatter, pixel };
}

describe('Scatter', () => {
  it('stacks pieces: a second piece blends over the first instead of replacing it', () => {
    const { scatter, pixel } = setup();
    const half = rgba(0, 0, 200, 128);
    scatter.fill(new Path().polygon([0, 0, 10, 0, 10, 10, 0, 10]), RED);
    scatter.fill(new Path().polygon([0, 0, 10, 0, 10, 10, 0, 10]), half);
    expect(pixel(5, 5)).toEqual([100, 0, 100, 255]);
    expect(pixel(15, 5)).toEqual([255, 255, 255, 255]);
  });

  it('reports exactly the pixels it changed and clips to the picture', () => {
    const { scatter, pixel } = setup();
    scatter.spot(-2, 5, 4, (d) => (d < 3 ? 255 : 0), RED);
    // Only column 0 is on the picture, and there the spot spans rows 3 to 6.
    expect(scatter.takeChanged()).toEqual({ x: 0, y: 3, width: 1, height: 4 });
    expect(pixel(0, 5)).toEqual([200, 0, 0, 255]);
    expect(pixel(1, 5)).toEqual([255, 255, 255, 255]);
    expect(scatter.takeChanged()).toEqual(EMPTY_RECT);
  });

  it('stops a spot at the right edge instead of wrapping onto the next row', () => {
    const { scatter, pixel } = setup();
    scatter.spot(19, 5, 3, () => 255, RED);
    expect(pixel(19, 5)).toEqual([200, 0, 0, 255]);
    for (let y = 0; y < 10; y++) expect(pixel(0, y), `row ${y}`).toEqual([255, 255, 255, 255]);
  });

  it('scales a spot by its opacity, caps it at full, and skips where it is zero or less', () => {
    const { scatter, pixel } = setup();
    scatter.spot(10, 5, 6, (d) => (d < 1 ? 900 : d < 3 ? 51 : -10), RED);
    expect(pixel(10, 5)).toEqual([200, 0, 0, 255]);
    expect(pixel(12, 5)).toEqual([244, 204, 204, 255]);
    expect(pixel(15, 5)).toEqual([255, 255, 255, 255]);
    expect(scatter.takeChanged()).toEqual({ x: 7, y: 2, width: 6, height: 6 });
  });

  it('draws round-ended lines, all within the reported rectangle', () => {
    const { scatter, pixel } = setup();
    scatter.line([[4, 5, 14, 5]], 2, RED);
    expect(pixel(9, 5)).toEqual([200, 0, 0, 255]);
    expect(pixel(9, 2)).toEqual([255, 255, 255, 255]);
    expect(scatter.takeChanged()).toEqual({ x: 3, y: 4, width: 12, height: 2 });
  });

  it('leaves a bent line open, with no side from its end back to its start', () => {
    const { scatter, pixel } = setup();
    scatter.line([[2, 8, 10, 1, 18, 8]], 2, RED);
    expect(pixel(10, 1)).toEqual([200, 0, 0, 255]);
    expect(pixel(10, 8)).toEqual([255, 255, 255, 255]);
  });

  it('keeps a spot round even when its opacity never fades', () => {
    const { scatter, pixel } = setup();
    scatter.spot(10, 5, 4, () => 255, RED);
    expect(pixel(10, 5)).toEqual([200, 0, 0, 255]);
    // The spot reaches one pixel past its radius for antialiasing, and no farther: the corner of
    // the square around it stays white.
    expect(pixel(5, 0)).toEqual([255, 255, 255, 255]);
    expect(scatter.takeChanged()).toEqual({ x: 5, y: 0, width: 10, height: 10 });
  });

  it('does nothing for pieces entirely off the picture', () => {
    const { scatter } = setup();
    scatter.fill(new Path().polygon([30, 0, 40, 0, 40, 10]), RED);
    scatter.line([[-20, -20, -10, -10]], 3, RED);
    scatter.spot(50, 50, 5, () => 255, RED);
    expect(scatter.takeChanged()).toEqual(EMPTY_RECT);
  });

  it('touches what it writes, so undo puts every pixel back', () => {
    const doc = createDocument(200, 100);
    const history = new History(doc);
    const before = doc.paint.data.slice();
    const change = history.begin();
    const scatter = new Scatter(doc, change);
    // Far apart, in different undo tiles, to catch a touch that covers only the first piece.
    scatter.fill(new Path().ellipse(10, 10, 8, 8), RED);
    scatter.line([[150, 80, 190, 90]], 4, RED);
    scatter.spot(100, 50, 10, () => 255, RED);
    history.commit(change);
    expect(doc.paint.data).not.toEqual(before);
    history.undo();
    expect(doc.paint.data).toEqual(before);
  });
});
