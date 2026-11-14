import { describe, expect, it } from 'vitest';
import { fitForPieces, MIN_DETAIL, MIN_DIFFERENCE, pieceDetail, piecesAlike } from './pieceDetail.ts';

/** An RGBA image filled by `paint(x, y)`, which returns [r, g, b, a]. */
function image(width: number, height: number, paint: (x: number, y: number) => readonly number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels.set(paint(x, y), (y * width + x) * 4);
  return pixels;
}

const WHITE = [255, 255, 255, 255];
const gray = (value: number) => [value, value, value, 255];
const BLACK = [0, 0, 0, 255];

/** Two pieces side by side with the same light and dark columns, the right one `shift` grays lighter. */
function shifted(shift: number): Uint8ClampedArray {
  return image(4, 2, (x) => gray((x % 2 === 0 ? 40 : 200) + (x < 2 ? 0 : shift)));
}

describe('pieceDetail', () => {
  it('finds no detail in a blank piece and full detail in a half black, half white one', () => {
    // Left half of the image is stripes, right half white: two pieces side by side.
    const pixels = image(8, 4, (x) => (x < 4 && x % 2 === 0 ? BLACK : WHITE));
    const [left = -1, right = -1] = pieceDetail(pixels, 8, 4, 2, 1);
    expect(left).toBeCloseTo(127.5, 1);
    expect(right).toBe(0);
  });

  it('cuts pieces row by row, top row first', () => {
    const pixels = image(4, 4, (x, y) => (y >= 2 && x % 2 === 0 ? BLACK : WHITE));
    const details = pieceDetail(pixels, 4, 4, 1, 2);
    expect(details[0]).toBe(0);
    expect(details[1]).toBeCloseTo(127.5, 1);
  });

  it('counts a transparent pixel as white paper, not black', () => {
    const pixels = image(4, 2, (x) => (x % 2 === 0 ? [0, 0, 0, 0] : WHITE));
    expect(pieceDetail(pixels, 4, 2, 1, 1)).toEqual([0]);
  });

  it('weighs green as the brightest channel, as the eye does', () => {
    const pixels = image(2, 1, (x) => (x === 0 ? [0, 255, 0, 255] : [0, 0, 255, 255]));
    const [detail = 0] = pieceDetail(pixels, 2, 1, 1, 1);
    expect(detail).toBeCloseTo(((0.587 - 0.114) * 255) / 2, 1);
  });

  it('finds nothing in a piece too thin to hold a pixel', () => {
    // Two pixels across cut into four columns: two of the pieces are empty.
    const pixels = image(2, 1, (x) => (x === 0 ? BLACK : WHITE));
    expect(pieceDetail(pixels, 2, 1, 4, 1)).toEqual([0, 0, 0, 0]);
  });

  it('refuses pixels that do not match the size', () => {
    expect(() => pieceDetail(new Uint8ClampedArray(12), 2, 2, 1, 1)).toThrow(/has 16 values, not 12/);
  });
});

describe('fitForPieces', () => {
  it('passes a picture with something in every piece, and fails one with a blank piece', () => {
    // Checks in a different ink in each quarter, so every piece shows something and no two look alike.
    const inks = [BLACK, [220, 0, 0, 255], [0, 0, 220, 255], [0, 150, 0, 255]];
    const busy = image(8, 8, (x, y) =>
      (x + y) % 2 === 0 ? (inks[(y < 4 ? 0 : 2) + (x < 4 ? 0 : 1)] ?? BLACK) : WHITE,
    );
    expect(fitForPieces(busy, 8, 8, 2, 2)).toBe(true);
    const corner = image(8, 8, (x, y) => (x < 4 && y < 4 && (x + y) % 2 === 0 ? BLACK : WHITE));
    expect(fitForPieces(corner, 8, 8, 2, 2)).toBe(false);
    expect(fitForPieces(corner, 8, 8, 1, 1)).toBe(true);
  });

  it('fails a picture whose pieces all look alike, such as the same stripes repeated', () => {
    // Every piece is the same stripes, so each shows plenty, yet a child cannot tell one from another.
    const stripes = image(16, 8, (x) => (x % 4 < 2 ? BLACK : WHITE));
    expect(pieceDetail(stripes, 16, 8, 2, 2).every((detail) => detail >= MIN_DETAIL)).toBe(true);
    expect(fitForPieces(stripes, 16, 8, 2, 2)).toBe(false);
  });

  it('fails a picture with just two look-alike pieces among different ones', () => {
    // Columns 0 and 2 are the same checks; column 1 is a black block on its left half.
    const pixels = image(24, 8, (x, y) => {
      if (x >= 8 && x < 16) return x < 12 ? BLACK : WHITE;
      return (x + y) % 2 === 0 ? BLACK : WHITE;
    });
    expect(fitForPieces(pixels, 24, 8, 3, 1)).toBe(false);
    expect(piecesAlike(pixels, 24, 8, 3, 1)).toEqual([[0, 2]]);
  });

  it('tells pieces apart by color as well as by light', () => {
    // The same shape in red and in blue: equal brightness spread, plainly different pieces.
    const pixels = image(16, 8, (x, y) => {
      const ink = x < 8 ? [220, 0, 0, 255] : [0, 0, 220, 255];
      return x % 8 < 4 === y < 4 ? ink : WHITE;
    });
    expect(piecesAlike(pixels, 16, 8, 2, 1)).toEqual([]);
    expect(fitForPieces(pixels, 16, 8, 2, 1)).toBe(true);
  });

  it('calls pieces alike below the least difference, and different at it', () => {
    expect(piecesAlike(shifted(MIN_DIFFERENCE), 4, 2, 2, 1)).toEqual([]);
    expect(piecesAlike(shifted(MIN_DIFFERENCE - 1), 4, 2, 2, 1)).toEqual([[0, 1]]);
  });

  it('needs at least the least detail, not more', () => {
    // A piece of two grays MIN_DETAIL * 2 apart has a spread of exactly MIN_DETAIL.
    const edge = image(2, 1, (x) => (x === 0 ? gray(100) : gray(100 + MIN_DETAIL * 2)));
    expect(fitForPieces(edge, 2, 1, 1, 1)).toBe(true);
    const below = image(2, 1, (x) => (x === 0 ? gray(100) : gray(100 + MIN_DETAIL * 2 - 2)));
    expect(fitForPieces(below, 2, 1, 1, 1)).toBe(false);
  });
});
