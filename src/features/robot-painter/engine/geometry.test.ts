import { describe, expect, it } from 'vitest';
import { insideCanvas, normalizeHeading, samePoint, TOLERANCE, unitStep } from './geometry.ts';

describe('unitStep', () => {
  it.each([
    [0, { x: 0, y: -1 }],
    [90, { x: 1, y: 0 }],
    [180, { x: 0, y: 1 }],
    [270, { x: -1, y: 0 }],
  ])('steps exactly along the axis at heading %s', (heading, expected) => {
    // toEqual treats 0 and -0 as different, so compare with + 0 to ignore the sign of zero.
    const step = unitStep(heading);
    expect({ x: step.x + 0, y: step.y + 0 }).toEqual(expected);
  });

  it.each([30, 45, 60, 72, 144, 150, 359])('steps one unit at heading %s, opposite to heading + 180', (heading) => {
    const step = unitStep(heading);
    const back = unitStep(heading + 180);
    expect(Math.abs(Math.sqrt(step.x * step.x + step.y * step.y) - 1)).toBeLessThan(1e-15);
    expect(back).toEqual({ x: -step.x, y: -step.y });
  });

  it('points up and to the right at heading 30, clockwise from up', () => {
    const step = unitStep(30);
    expect(step.x).toBeCloseTo(0.5, 15);
    expect(step.y).toBeCloseTo(-Math.sqrt(3) / 2, 15);
  });

  it('wraps negative and large headings', () => {
    expect(unitStep(-90)).toEqual(unitStep(270));
    expect(unitStep(450)).toEqual(unitStep(90));
    expect(normalizeHeading(-30)).toBe(330);
    expect(normalizeHeading(720)).toBe(0);
  });
});

describe('samePoint and insideCanvas', () => {
  it.each([
    [TOLERANCE / 2, true],
    [TOLERANCE * 2, false],
  ])('compares points %s apart', (gap, same) => {
    expect(samePoint({ x: 1, y: 1 }, { x: 1 + gap, y: 1 })).toBe(same);
    expect(samePoint({ x: 1, y: 1 }, { x: 1, y: 1 - gap })).toBe(same);
  });

  it.each([
    [{ x: 0, y: 0 }, true],
    [{ x: 4, y: 3 }, true],
    [{ x: -TOLERANCE / 2, y: 3 + TOLERANCE / 2 }, true],
    [{ x: -TOLERANCE * 2, y: 1 }, false],
    [{ x: 1, y: -TOLERANCE * 2 }, false],
    [{ x: 4 + TOLERANCE * 2, y: 1 }, false],
    [{ x: 1, y: 3 + TOLERANCE * 2 }, false],
  ])('keeps %o on a 4 by 3 canvas: %s', (point, inside) => {
    expect(insideCanvas(point, { width: 4, height: 3 })).toBe(inside);
  });
});
