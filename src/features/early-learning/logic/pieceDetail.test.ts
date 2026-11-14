import { describe, expect, it } from 'vitest';
import { fitForPieces, MIN_DETAIL, pieceDetail } from './pieceDetail.ts';

/** An RGBA image filled by `paint(x, y)`, which returns [r, g, b, a]. */
function image(width: number, height: number, paint: (x: number, y: number) => readonly number[]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels.set(paint(x, y), (y * width + x) * 4);
  return pixels;
}

const WHITE = [255, 255, 255, 255];
const gray = (value: number) => [value, value, value, 255];
const BLACK = [0, 0, 0, 255];

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
    expect(details[1]).toBeGreaterThan(100);
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

  it('refuses pixels that do not match the size', () => {
    expect(() => pieceDetail(new Uint8ClampedArray(12), 2, 2, 1, 1)).toThrow(/has 16 values, not 12/);
  });
});

describe('fitForPieces', () => {
  it('passes a picture with something in every piece, and fails one with a blank piece', () => {
    const busy = image(8, 8, (x, y) => ((x + y) % 2 === 0 ? BLACK : WHITE));
    expect(fitForPieces(busy, 8, 8, 2, 2)).toBe(true);
    const corner = image(8, 8, (x, y) => (x < 4 && y < 4 && (x + y) % 2 === 0 ? BLACK : WHITE));
    expect(fitForPieces(corner, 8, 8, 2, 2)).toBe(false);
    expect(fitForPieces(corner, 8, 8, 1, 1)).toBe(true);
  });

  it('needs at least the least detail, not more', () => {
    // A piece of two grays MIN_DETAIL * 2 apart has a spread of exactly MIN_DETAIL.
    const edge = image(2, 1, (x) => (x === 0 ? gray(100) : gray(100 + MIN_DETAIL * 2)));
    expect(fitForPieces(edge, 2, 1, 1, 1)).toBe(true);
    const below = image(2, 1, (x) => (x === 0 ? gray(100) : gray(100 + MIN_DETAIL * 2 - 2)));
    expect(fitForPieces(below, 2, 1, 1, 1)).toBe(false);
  });
});
