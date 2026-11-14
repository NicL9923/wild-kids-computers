import { describe, expect, it } from 'vitest';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from '../../../core/paint/document.ts';
import { PEN_COLOR_VALUES } from './colors.ts';
import { canonicalDrawing, compareDrawings, sameDrawing, toPaintPicture } from './drawing.ts';
import type { Segment } from './geometry.ts';
import type { PenColor } from './program.ts';

const seg = (x1: number, y1: number, x2: number, y2: number, color: PenColor = 'blue'): Segment => ({
  from: { x: x1, y: y1 },
  to: { x: x2, y: y2 },
  color,
});

describe('canonicalDrawing', () => {
  it.each([
    ['merges two pieces that touch end to end', [seg(0, 0, 1, 0), seg(1, 0, 2, 0)], [seg(0, 0, 2, 0)]],
    ['ignores the direction a line was drawn', [seg(2, 0, 0, 0)], [seg(0, 0, 2, 0)]],
    [
      'keeps one copy of a line drawn back and forth',
      [seg(0, 1, 0, 3), seg(0, 3, 0, 1), seg(0, 1, 0, 3)],
      [seg(0, 1, 0, 3)],
    ],
    ['merges pieces that overlap', [seg(0, 0, 2, 0), seg(3, 0, 1, 0)], [seg(0, 0, 3, 0)]],
    ['merges a piece inside another', [seg(0, 0, 4, 0), seg(1, 0, 2, 0)], [seg(0, 0, 4, 0)]],
    ['keeps a gap between pieces', [seg(2, 0, 3, 0), seg(0, 0, 1, 0)], [seg(0, 0, 1, 0), seg(2, 0, 3, 0)]],
    ['keeps parallel lines apart', [seg(0, 0, 2, 0), seg(0, 1, 2, 1)], [seg(0, 0, 2, 0), seg(0, 1, 2, 1)]],
    ['keeps crossing lines apart', [seg(0, 1, 2, 1), seg(1, 0, 1, 2)], [seg(0, 1, 2, 1), seg(1, 0, 1, 2)]],
    ['drops a line too short to see', [seg(1, 1, 1, 1 + 1e-7)], []],
    [
      'paints a later color over an earlier one',
      [seg(0, 0, 4, 0, 'red'), seg(1, 0, 2, 0, 'green')],
      [seg(0, 0, 1, 0, 'red'), seg(2, 0, 4, 0, 'red'), seg(1, 0, 2, 0, 'green')],
    ],
    [
      'keeps both colors where they only touch',
      [seg(0, 0, 1, 0, 'red'), seg(1, 0, 2, 0, 'green')],
      [seg(0, 0, 1, 0, 'red'), seg(1, 0, 2, 0, 'green')],
    ],
    [
      'lets a color fully covered by another vanish',
      [seg(1, 0, 2, 0, 'red'), seg(0, 0, 3, 0, 'green')],
      [seg(0, 0, 3, 0, 'green')],
    ],
  ])('%s', (_, input, expected) => {
    expect(canonicalDrawing(input)).toEqual(expected);
  });

  it('merges pieces of a slanted line computed along different paths', () => {
    // 0.1 + 0.2 is not 0.3 in floating point, so the pieces meet only within the tolerance.
    const a = seg(0, 0, 0.1 + 0.2, (0.1 + 0.2) * 2);
    const b = seg(0.3, 0.6, 1, 2);
    expect(canonicalDrawing([a, b])).toEqual([seg(0, 0, 1, 2)]);
  });

  it('treats nearly vertical lines that lean either way as one line', () => {
    expect(canonicalDrawing([seg(5, 0, 5 + 1e-12, 1), seg(5 + 1e-12, 1, 5 - 1e-12, 2)])).toEqual([seg(5, 0, 5, 2)]);
  });
});

describe('compareDrawings', () => {
  it('finds a missing piece, an extra piece, and a piece in the wrong color', () => {
    const drawing = [seg(0, 0, 2, 0), seg(0, 0, 0, 1, 'red'), seg(5, 5, 6, 5)];
    const target = [seg(0, 0, 3, 0), seg(0, 0, 0, 1, 'green')];
    expect(compareDrawings(drawing, target)).toEqual({
      extra: [seg(5, 5, 6, 5)],
      missing: [seg(2, 0, 3, 0)],
      wrongColor: [{ segment: seg(0, 0, 0, 1, 'red'), expected: 'green' }],
    });
  });

  it('reports a line drawn too long as an extra piece only', () => {
    expect(compareDrawings([seg(0, 0, 3, 0)], [seg(0, 0, 2, 0)])).toEqual({
      extra: [seg(2, 0, 3, 0)],
      missing: [],
      wrongColor: [],
    });
  });
});

describe('sameDrawing', () => {
  it('matches a picture drawn in another order and direction, with a line drawn twice', () => {
    const square = [seg(0, 0, 1, 0), seg(1, 0, 1, 1), seg(1, 1, 0, 1), seg(0, 1, 0, 0)];
    const other = [
      seg(0, 0, 0, 1),
      seg(0, 1, 1, 1),
      seg(1, 0, 1, 1),
      seg(0, 0, 0.5, 0),
      seg(1, 0, 0.5, 0),
      seg(0, 0, 1, 0),
    ];
    expect(sameDrawing(square, other)).toBe(true);
  });

  it.each([
    ['within the tolerance', 5e-7, true],
    ['beyond the tolerance', 2e-6, false],
  ])('compares a line moved %s', (_, shift, same) => {
    expect(sameDrawing([seg(0, 0, 2, 0)], [seg(0, shift, 2, shift)])).toBe(same);
  });

  it('tells pictures in different colors apart', () => {
    expect(sameDrawing([seg(0, 0, 1, 0, 'red')], [seg(0, 0, 1, 0, 'blue')])).toBe(false);
  });
});

describe('toPaintPicture', () => {
  it('scales the canvas evenly into the document, centered inside the margin', () => {
    const picture = toPaintPicture(
      [seg(0, 0, 8, 0, 'red'), seg(8, 0, 0, 0, 'red'), seg(0, 5, 0, 0)],
      { width: 8, height: 5 },
      { margin: 100, lineWidth: 10 },
    );
    // The height is the tighter side: 800 px for 5 units is 160 px a unit, and 8 units is 1280 px.
    expect(picture.width).toBe(DOCUMENT_WIDTH);
    expect(picture.height).toBe(DOCUMENT_HEIGHT);
    expect(picture.lines).toEqual([
      { from: { x: 160, y: 100 }, to: { x: 160, y: 900 }, color: PEN_COLOR_VALUES.blue, width: 10 },
      { from: { x: 160, y: 100 }, to: { x: 1440, y: 100 }, color: PEN_COLOR_VALUES.red, width: 10 },
    ]);
  });

  it('fits a tall canvas by its width when that is the tighter side', () => {
    const picture = toPaintPicture([seg(0, 0, 1, 0)], { width: 1, height: 10 });
    // 800 px of height for 10 units is 80 px a unit, narrower than 1400 px for 1 unit.
    expect(picture.lines[0]).toMatchObject({ from: { x: 760, y: 100 }, to: { x: 840, y: 100 }, width: 16 });
  });
});
