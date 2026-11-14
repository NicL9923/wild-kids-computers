import { describe, expect, it } from 'vitest';
import { blendPixel, div255, hsv, mixColors, rgba, toHsv } from './color.ts';

describe('div255', () => {
  it('rounds v / 255 to the nearest integer for every product of two 8-bit values', () => {
    const wrong: number[] = [];
    for (let v = 0; v <= 65025; v++) if (div255(v) !== Math.round(v / 255)) wrong.push(v);
    expect(wrong).toEqual([]);
    expect(div255(65025)).toBe(255);
  });
});

const pixel = (...values: number[]): Uint8ClampedArray => new Uint8ClampedArray(values);

describe('blendPixel', () => {
  it('replaces the pixel at full alpha and leaves it at zero alpha', () => {
    const data = pixel(10, 20, 30, 255);
    blendPixel(data, 0, 200, 100, 50, 0);
    expect([...data]).toEqual([10, 20, 30, 255]);
    blendPixel(data, 0, 200, 100, 50, 255);
    expect([...data]).toEqual([200, 100, 50, 255]);
  });

  it('mixes over an opaque pixel by alpha and keeps it opaque', () => {
    const data = pixel(0, 100, 255, 255);
    blendPixel(data, 0, 255, 100, 0, 128);
    expect([...data]).toEqual([128, 100, 127, 255]);
  });

  it('over a transparent pixel, takes the source color and alpha unchanged', () => {
    const data = pixel(0, 0, 0, 0);
    blendPixel(data, 0, 200, 100, 50, 64);
    expect([...data]).toEqual([200, 100, 50, 64]);
  });

  it('over a half-transparent pixel, weights each color by its share of the result', () => {
    const data = pixel(0, 0, 255, 128);
    blendPixel(data, 0, 255, 0, 0, 128);
    // Source weight 128, destination weight 128 * 127 / 255 = 63.75, total alpha about 192.
    expect([...data]).toEqual([170, 0, 85, 192]);
  });
});

describe('colors', () => {
  it('clamps and rounds channels', () => {
    expect(rgba(-5, 300, 12.5, 999)).toEqual({ r: 0, g: 255, b: 13, a: 255 });
  });

  it('mixes two colors and clamps the amount', () => {
    const black = rgba(0, 0, 0);
    const white = rgba(255, 255, 255);
    expect(mixColors(black, white, 0.5)).toEqual(rgba(128, 128, 128));
    expect(mixColors(black, white, 2)).toEqual(white);
    expect(mixColors(black, white, -1)).toEqual(black);
  });

  it.each([
    [0, rgba(255, 0, 0)],
    [1 / 6, rgba(255, 255, 0)],
    [2 / 6, rgba(0, 255, 0)],
    [3 / 6, rgba(0, 255, 255)],
    [4 / 6, rgba(0, 0, 255)],
    [5 / 6, rgba(255, 0, 255)],
    [1, rgba(255, 0, 0)],
    [-1 / 6, rgba(255, 0, 255)],
  ])('hsv at hue %d gives the primary or secondary color', (hue, expected) => {
    expect(hsv(hue, 1, 1)).toEqual(expected);
  });

  it('toHsv inverts hsv for colors in every sector and gives gray no hue', () => {
    for (const color of [
      rgba(200, 40, 40),
      rgba(200, 180, 40),
      rgba(40, 200, 90),
      rgba(40, 150, 200),
      rgba(90, 40, 200),
      rgba(200, 40, 160),
    ]) {
      const { hue, saturation, value } = toHsv(color.r, color.g, color.b);
      expect(hsv(hue, saturation, value)).toEqual(color);
    }
    expect(toHsv(128, 128, 128)).toEqual({ hue: 0, saturation: 0, value: 128 / 255 });
  });
});
