/* oxlint-disable no-restricted-properties, wkc/no-exponent-operator -- the reference coverage below uses plain floating-point math on purpose. */
import { describe, expect, it } from 'vitest';
import { cos, sin, TAU } from './math.ts';
import { Path } from './path.ts';
import { rasterizePath, rasterizeStroke } from './raster.ts';

const CLIP = { x: 0, y: 0, width: 40, height: 30 };

/** Coverage per pixel as a dense grid, 0 to 255. */
function coverage(path: Path, clip = CLIP): number[][] {
  const grid = Array.from({ length: clip.height }, () => Array.from({ length: clip.width }, () => 0));
  rasterizePath(path, clip, (x, y, value) => {
    const row = grid[y - clip.y];
    if (row !== undefined) row[x - clip.x] = value;
  });
  return grid;
}

function total(grid: number[][]): number {
  return grid.flat().reduce((sum, value) => sum + value, 0) / 255;
}

const square = (x0: number, y0: number, x1: number, y1: number) => new Path().polygon([x0, y0, x1, y0, x1, y1, x0, y1]);

describe('rasterizePath', () => {
  it('covers whole pixels fully and splits a half pixel edge exactly', () => {
    const grid = coverage(square(2.5, 3, 6, 5));
    expect(grid[3]?.slice(1, 7)).toEqual([0, 128, 255, 255, 255, 0]);
    expect(grid[5]?.slice(1, 7)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('gives a covered area equal to the shape area, for a circle and a tilted triangle', () => {
    expect(total(coverage(new Path(0.01).ellipse(20, 15, 9, 9)))).toBeCloseTo(Math.PI * 81, 0);
    expect(total(coverage(new Path().polygon([3.3, 2.1, 37.7, 9.4, 11.2, 27.9])))).toBeCloseTo(
      Math.abs((37.7 - 3.3) * (27.9 - 2.1) - (11.2 - 3.3) * (9.4 - 2.1)) / 2,
      1,
    );
  });

  it('returns the rectangle of pixels it covered, which can start inside the bounds', () => {
    // The left column and top row are covered by less than half a 255th, so they round to nothing.
    expect(rasterizePath(square(2.999, 3.999, 6, 6), CLIP, () => undefined)).toEqual({
      x: 3,
      y: 4,
      width: 3,
      height: 2,
    });
    expect(rasterizePath(square(7, 8, 8, 9), CLIP, () => undefined)).toEqual({ x: 7, y: 8, width: 1, height: 1 });
  });

  it('visits nothing for a zero-area sliver that spans a large box', () => {
    let visits = 0;
    expect(rasterizePath(new Path().polygon([5, 5, 25, 20, 5, 5]), CLIP, () => (visits += 1)).width).toBe(0);
    expect(visits).toBe(0);
  });

  it('returns the covered rectangle, or an empty one for a shape with no area', () => {
    expect(rasterizePath(square(2, 3, 6, 5), CLIP, () => undefined)).toEqual({ x: 2, y: 3, width: 4, height: 2 });
    expect(rasterizePath(square(5, 5, 5, 20), CLIP, () => undefined).width).toBe(0);
    expect(rasterizePath(new Path(), CLIP, () => undefined).width).toBe(0);
  });

  it('fills the visible part of a shape that hangs off every edge', () => {
    const grid = coverage(square(-10.5, -4, 50, 12.5));
    expect(grid[0]?.every((value) => value === 255)).toBe(true);
    expect(grid[12]?.every((value) => value === 128)).toBe(true);
    expect(grid[13]?.every((value) => value === 0)).toBe(true);
  });

  it('paints nothing for a shape entirely outside the clip', () => {
    let visits = 0;
    rasterizePath(square(-20, -20, -5, -5), CLIP, () => (visits += 1));
    rasterizePath(square(10, 40, 20, 50), CLIP, () => (visits += 1));
    expect(visits).toBe(0);
  });

  it('cuts a hole with a contour wound the other way, and merges overlaps wound the same way', () => {
    const ring = new Path().ellipse(20, 15, 12, 12, 1).ellipse(20, 15, 6, 6, -1);
    expect(coverage(ring)[15]?.[20]).toBe(0);
    expect(coverage(ring)[15]?.[29]).toBe(255);
    const overlap = coverage(square(5, 5, 20, 20).polygon([10, 10, 25, 10, 25, 25, 10, 25]));
    expect(Math.max(...overlap.flat())).toBe(255);
    expect(total(overlap)).toBeCloseTo(15 * 15 * 2 - 10 * 10, 6);
  });
});

function stroke(polylines: number[][], width: number, closed: boolean): number[][] {
  const grid = Array.from({ length: CLIP.height }, () => Array.from({ length: CLIP.width }, () => 0));
  rasterizeStroke(polylines, width, closed, CLIP, (x, y, value) => {
    const row = grid[y];
    if (row !== undefined) row[x] = value;
  });
  return grid;
}

/** Shapes with slanted edges that cross every side of CLIP, and one inside it. */
const CROSSING = [
  new Path().polygon([-12.3, -7.1, 22.6, 4.4, 3.7, 18.9]),
  new Path().polygon([28.2, 9.5, 51.7, 14.2, 44.4, 41.8, 21.9, 27.3]),
  new Path().polygon([-6, 26, 18, 22.5, 9, 37]),
  new Path(0.05).ellipse(20, 15, 26, 11),
  new Path().polygon([12.5, 6.25, 30.75, 8.5, 18, 20.2]),
];
const WIDE = { x: -60, y: -60, width: 160, height: 140 };

/** Coverage inside CLIP, computed with the given clip. */
function within(
  draw: (clip: typeof CLIP, visit: (x: number, y: number, c: number) => void) => void,
  clip: typeof CLIP,
): number[][] {
  const grid = Array.from({ length: CLIP.height }, () => Array.from({ length: CLIP.width }, () => 0));
  draw(clip, (x, y, value) => {
    const row = grid[y];
    if (row !== undefined && x >= 0 && x < CLIP.width) row[x] = value;
  });
  return grid;
}

describe('clipping', () => {
  it.each(CROSSING.map((path, i) => [i, path] as const))(
    'gives shape %i the same coverage whether or not the clip cuts it',
    (_i, path) => {
      const draw = (clip: typeof CLIP, visit: (x: number, y: number, c: number) => void) =>
        rasterizePath(path, clip, visit);
      expect(within(draw, CLIP)).toEqual(within(draw, WIDE));
    },
  );

  it('gives a stroke the same coverage whether or not the clip cuts it', () => {
    const points = [-8.2, 3.1, 25.4, -4.7, 47.9, 19.3, 14.6, 35.2, -5.5, 22.8];
    const draw = (clip: typeof CLIP, visit: (x: number, y: number, c: number) => void) =>
      rasterizeStroke([points], 5, true, clip, visit);
    expect(within(draw, CLIP)).toEqual(within(draw, WIDE));
  });

  it('leaves nothing behind in its buffers for the next shape', () => {
    // A different buffer width from the shapes before it, so leftovers would land on its pixels.
    const laterClip = { x: 0, y: 0, width: 30, height: 30 };
    const later = new Path().polygon([1.5, 0.5, 29.5, 3.5, 11.5, 29.5]);
    const fresh = coverage(later, laterClip);
    for (const path of CROSSING) rasterizePath(path, CLIP, () => undefined);
    rasterizeStroke([[-5, 5, 45, 25]], 6, false, CLIP, () => undefined);
    expect(coverage(later, laterClip)).toEqual(fresh);
    const freshStroke = within((clip, visit) => rasterizeStroke([[3, 3, 12, 20]], 3, false, clip, visit), CLIP);
    rasterizeStroke([[-5, 5, 45, 25]], 9, false, WIDE, () => undefined);
    expect(within((clip, visit) => rasterizeStroke([[3, 3, 12, 20]], 3, false, clip, visit), CLIP)).toEqual(
      freshStroke,
    );
  });
});

describe('rasterizeStroke', () => {
  it('draws a disc for a single point or a zero-length line', () => {
    expect(total(stroke([[20, 15]], 10, false))).toBeCloseTo(Math.PI * 25, 0);
    expect(stroke([[20, 15, 20, 15]], 10, false)).toEqual(stroke([[20, 15]], 10, false));
  });

  it('covers a straight line evenly, with exact half coverage at its edge', () => {
    const line = stroke([[5, 10.5, 35, 10.5]], 2, false);
    // Width 2 centered on row 10 spans y = 9.5 to 11.5: row 10 full, rows 9 and 11 half.
    expect([8, 9, 10, 11, 12].map((y) => line[y]?.[20])).toEqual([0, 128, 255, 128, 0]);
  });

  it('closes a polygon outline with solid round corners and an empty middle', () => {
    const outline = stroke([[5.5, 5.5, 35.5, 5.5, 35.5, 25.5, 5.5, 25.5]], 2, true);
    for (const [x, y] of [
      [5, 5],
      [20, 5],
      [35, 5],
      [35, 15],
      [35, 25],
      [20, 25],
      [5, 25],
      [5, 15],
    ] as const) {
      expect(outline[y]?.[x], `pixel ${x}, ${y}`).toBe(255);
    }
    expect(outline[15]?.[20]).toBe(0);
  });

  it('gives a union with no doubled edges where segments overlap', () => {
    // The same segment twice, and a segment folded back on itself, match one segment.
    const once = stroke([[5, 15, 35, 15]], 4, false);
    expect(
      stroke(
        [
          [5, 15, 35, 15],
          [5, 15, 35, 15],
        ],
        4,
        false,
      ),
    ).toEqual(once);
    expect(stroke([[5, 15, 35, 15, 5, 15]], 4, false)).toEqual(once);
  });

  it('keeps a smooth curve solid along its whole length', () => {
    const points: number[] = [];
    for (let i = 0; i < 200; i++) points.push(20 + 10 * cos((TAU * i) / 200), 15 + 10 * sin((TAU * i) / 200));
    const ring = stroke([points], 3, true);
    for (let i = 0; i < 64; i++) {
      const angle = (TAU * i) / 64;
      const x = Math.floor(20 + 10 * cos(angle));
      const y = Math.floor(15 + 10 * sin(angle));
      expect(ring[y]?.[x], `angle ${i}`).toBeGreaterThan(200);
    }
  });

  it('matches the coverage computed from the distance to the nearest segment, pixel by pixel', () => {
    const points = [3.2, 4.7, 31.9, 9.3, 24.4, 26.1, 6.8, 21.5];
    const radius = 2.6;
    const distance = (px: number, py: number, i: number): number => {
      const ax = points[2 * i] ?? 0;
      const ay = points[2 * i + 1] ?? 0;
      const bx = points[(2 * i + 2) % points.length] ?? 0;
      const by = points[(2 * i + 3) % points.length] ?? 0;
      const t = Math.min(
        1,
        Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
      );
      return Math.hypot(px - (ax + (bx - ax) * t), py - (ay + (by - ay) * t));
    };
    const expected = Array.from({ length: CLIP.height }, (_, y) =>
      Array.from({ length: CLIP.width }, (_cell, x) => {
        const d = Math.min(...[0, 1, 2, 3].map((i) => distance(x + 0.5, y + 0.5, i)));
        return Math.round(Math.min(1, Math.max(0, radius - d + 0.5)) * 255);
      }),
    );
    expect(stroke([points], radius * 2, true)).toEqual(expected);
  });

  it('returns the rectangle of pixels it covered, down to a single pixel', () => {
    expect(rasterizeStroke([[5.5, 5.5]], 0.6, false, CLIP, () => undefined)).toEqual({
      x: 5,
      y: 5,
      width: 1,
      height: 1,
    });
    expect(rasterizeStroke([[10.5, 10.5, 20.5, 10.5]], 2, false, CLIP, () => undefined)).toEqual({
      x: 9,
      y: 9,
      width: 13,
      height: 3,
    });
  });

  it('draws nothing for zero width or no points', () => {
    expect(rasterizeStroke([[0, 0, 10, 10]], 0, false, CLIP, () => undefined).width).toBe(0);
    expect(rasterizeStroke([[]], 4, false, CLIP, () => undefined).width).toBe(0);
  });
});
