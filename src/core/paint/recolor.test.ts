import { describe, expect, it } from 'vitest';
import { rgba } from './color.ts';
import { luma, toneRamp } from './recolor.ts';

describe('luma', () => {
  it.each([
    { name: 'black', rgb: [0, 0, 0], expected: 0 },
    { name: 'white', rgb: [255, 255, 255], expected: 255 },
    // Green looks lightest and blue darkest at the same strength.
    { name: 'green', rgb: [0, 255, 0], expected: 149 },
    { name: 'red', rgb: [255, 0, 0], expected: 77 },
    { name: 'blue', rgb: [0, 0, 255], expected: 29 },
  ])('weighs $name like the eye does', ({ rgb, expected }) => {
    const [r = 0, g = 0, b = 0] = rgb;
    expect(luma(r, g, b)).toBe(expected);
  });
});

function at(table: Uint8Array, l: number): number[] {
  return [...table.subarray(l * 3, l * 3 + 3)];
}

describe('toneRamp', () => {
  const ramp = toneRamp([
    [0, rgba(0, 20, 40)],
    [100, rgba(200, 120, 40)],
    [255, rgba(255, 255, 255)],
  ]);

  it('hits each stop exactly', () => {
    expect(at(ramp, 0)).toEqual([0, 20, 40]);
    expect(at(ramp, 100)).toEqual([200, 120, 40]);
    expect(at(ramp, 255)).toEqual([255, 255, 255]);
  });

  it('blends in a straight line between stops, on both sides of the middle stop', () => {
    expect(at(ramp, 50)).toEqual([100, 70, 40]);
    // 155 steps from 100 to 255: a fifth of the way at 131.
    expect(at(ramp, 131)).toEqual([211, 147, 83]);
  });
});
