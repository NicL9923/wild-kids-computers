import { describe, expect, it } from 'vitest';
import { clipRect, EMPTY_RECT, growRect, intersectRect, isEmptyRect, rectFromBounds, unionRect } from './rect.ts';

describe('rectangles', () => {
  it('covers real-valued bounds with whole pixels, in either corner order', () => {
    expect(rectFromBounds(2.5, 3.2, -1.5, 7)).toEqual({ x: -2, y: 3, width: 5, height: 4 });
  });

  it('treats a rectangle with no area as empty, wherever it is', () => {
    expect(
      [EMPTY_RECT, { x: 5, y: 5, width: 0, height: 9 }, { x: 5, y: 5, width: 3, height: -1 }].map(isEmptyRect),
    ).toEqual([true, true, true]);
    expect(isEmptyRect({ x: -5, y: -5, width: 1, height: 1 })).toBe(false);
  });

  it('unions two rectangles and ignores an empty one on either side', () => {
    const a = { x: 0, y: 0, width: 4, height: 4 };
    const b = { x: 10, y: 2, width: 2, height: 8 };
    expect(unionRect(a, b)).toEqual({ x: 0, y: 0, width: 12, height: 10 });
    expect(unionRect(EMPTY_RECT, b)).toBe(b);
    expect(unionRect(a, { x: 50, y: 50, width: 0, height: 0 })).toBe(a);
  });

  it('intersects overlapping rectangles and gives empty for disjoint or touching ones', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(intersectRect(a, { x: 5, y: -5, width: 10, height: 10 })).toEqual({ x: 5, y: 0, width: 5, height: 5 });
    expect(intersectRect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(EMPTY_RECT);
    expect(intersectRect(a, { x: 0, y: 10, width: 5, height: 5 })).toBe(EMPTY_RECT);
  });

  it('clips to a surface and grows a rectangle but not an empty one', () => {
    expect(clipRect({ x: -3, y: 8, width: 10, height: 10 }, 5, 12)).toEqual({ x: 0, y: 8, width: 5, height: 4 });
    expect(growRect({ x: 2, y: 2, width: 1, height: 1 }, 2)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    expect(growRect(EMPTY_RECT, 2)).toBe(EMPTY_RECT);
  });
});
