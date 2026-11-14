import { describe, expect, it } from 'vitest';
import { rgba } from '../../core/paint/color.ts';
import {
  checkStartingPicture,
  openPaintStudioWith,
  paintLines,
  clearStartingPicture,
  peekStartingPicture,
  type StartingPicture,
} from './startingPicture.ts';

const BLUE = rgba(44, 95, 174);

function pixel(surface: { width: number; data: Uint8ClampedArray }, x: number, y: number): number[] {
  const i = (y * surface.width + x) * 4;
  return [...surface.data.subarray(i, i + 4)];
}

describe('starting picture', () => {
  it('paints lines scaled evenly to fit the paper and centered', () => {
    // A 10 by 10 drawing scales by 100 to fill the 1000 px height, centered across 1600 px.
    const paint = paintLines({
      kind: 'lines',
      width: 10,
      height: 10,
      lines: [{ from: { x: 0, y: 5 }, to: { x: 10, y: 5 }, color: BLUE, width: 0.2 }],
    });
    expect(pixel(paint, 800, 500)).toEqual([44, 95, 174, 255]);
    expect(pixel(paint, 310, 500)).toEqual([44, 95, 174, 255]);
    // Outside the centered square, and above the 20 px wide line, the paper stays white.
    expect(pixel(paint, 250, 500)).toEqual([255, 255, 255, 255]);
    expect(pixel(paint, 800, 470)).toEqual([255, 255, 255, 255]);
  });

  it('keeps a picture for the studio until the studio clears it, and never clears a newer one', () => {
    const first: StartingPicture = { kind: 'pixels', width: 1, height: 1, data: new Uint8ClampedArray(4) };
    const second: StartingPicture = { kind: 'pixels', width: 1, height: 1, data: new Uint8ClampedArray(4) };
    expect(openPaintStudioWith(first)).toBe('/paint');
    expect(peekStartingPicture()).toBe(first);
    openPaintStudioWith(second);
    clearStartingPicture(first);
    expect(peekStartingPicture()).toBe(second);
    clearStartingPicture(second);
    expect(peekStartingPicture()).toBeNull();
  });

  it.each([
    [{ kind: 'pixels', width: 0, height: 1, data: new Uint8ClampedArray() }, 'whole-number size'],
    [{ kind: 'pixels', width: 1.5, height: 1, data: new Uint8ClampedArray(6) }, 'whole-number size'],
    [{ kind: 'pixels', width: 2, height: 2, data: new Uint8ClampedArray(4) }, 'has 16 bytes, got 4'],
    [
      {
        kind: 'lines',
        width: 5,
        height: 5,
        lines: [{ from: { x: Number.NaN, y: 0 }, to: { x: 1, y: 1 }, color: BLUE, width: 1 }],
      },
      'Line 0 has a point',
    ],
    [
      {
        kind: 'lines',
        width: 5,
        height: 5,
        lines: [{ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: BLUE, width: 0 }],
      },
      'Line 0 needs a width',
    ],
  ] as const)('refuses a picture it cannot paint (%#) and says why', (picture, reason) => {
    expect(() => checkStartingPicture(picture)).toThrow(reason);
    expect(() => openPaintStudioWith(picture)).toThrow(reason);
    expect(peekStartingPicture()).toBeNull();
  });
});
