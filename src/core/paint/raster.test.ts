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

  it('draws nothing for zero width or no points', () => {
    expect(rasterizeStroke([[0, 0, 10, 10]], 0, false, CLIP, () => undefined).width).toBe(0);
    expect(rasterizeStroke([[]], 4, false, CLIP, () => undefined).width).toBe(0);
  });
});
