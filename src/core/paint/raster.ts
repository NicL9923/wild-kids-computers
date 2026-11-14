import { blendPixel, div255, type Color } from './color.ts';
import { signedArea, type Path } from './path.ts';
import { EMPTY_RECT, intersectRect, isEmptyRect, rectFromBounds, type Rect } from './rect.ts';
import type { Surface } from './surface.ts';

/**
 * The antialiased coverage filler.
 *
 * Each edge adds its signed area to an accumulation buffer, one cell per pixel. A running sum
 * along each row then gives the exact fraction of every pixel that lies inside the path. The
 * winding rule is nonzero, clamped: overlapping pieces with the same winding merge, and a
 * contour wound the other way cuts a hole. Glyph outlines and the outline stroker rely on that.
 */

/** Called once per covered pixel with coverage from 1 to 255. */
export type CoverageVisitor = (x: number, y: number, coverage: number) => void;

let scratch = new Float64Array(0);

function accumulationBuffer(size: number): Float64Array {
  if (scratch.length < size) scratch = new Float64Array(size);
  return scratch;
}

/** The area under clamp(u, 0, 1) from minus infinity to u. */
function rampIntegral(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return u - 0.5;
  return 0.5 * u * u;
}

class Accumulator {
  readonly cells: Float64Array;
  readonly stride: number;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.stride = width + 2;
    this.cells = accumulationBuffer(this.stride * height);
  }

  /** Adds an edge in local coordinates, clipping it to the rows and clamping it to the columns. */
  addEdge(x0: number, y0: number, x1: number, y1: number): void {
    if (y0 === y1) return;
    const h = this.height;
    if ((y0 <= 0 && y1 <= 0) || (y0 >= h && y1 >= h)) return;
    // Clip to 0 <= y <= h. Rows outside the buffer never read these parts.
    let ax = x0;
    let ay = y0;
    let bx = x1;
    let by = y1;
    const slope = (x1 - x0) / (y1 - y0);
    if (ay < 0) {
      ax += (0 - ay) * slope;
      ay = 0;
    } else if (ay > h) {
      ax += (h - ay) * slope;
      ay = h;
    }
    if (by < 0) {
      bx += (0 - by) * slope;
      by = 0;
    } else if (by > h) {
      bx += (h - by) * slope;
      by = h;
    }
    // Split where the edge crosses x = 0 or x = width. A part left of the buffer becomes a
    // vertical edge on its left side, which covers every pixel to its right, as the real edge does.
    const w = this.width;
    const cuts: number[] = [0, 1];
    if (ax !== bx) {
      for (const boundary of [0, w]) {
        const t = (boundary - ax) / (bx - ax);
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i] ?? 0;
      const t1 = cuts[i + 1] ?? 1;
      const px = Math.min(w, Math.max(0, ax + (bx - ax) * t0));
      const py = ay + (by - ay) * t0;
      const qx = Math.min(w, Math.max(0, ax + (bx - ax) * t1));
      const qy = ay + (by - ay) * t1;
      this.addLine(px, py, qx, qy);
    }
  }

  /** Adds an edge that lies inside the buffer: 0 <= x <= width and 0 <= y <= height. */
  private addLine(x0: number, y0: number, x1: number, y1: number): void {
    if (y0 === y1) return;
    let direction = 1;
    let topX = x0;
    let topY = y0;
    let bottomX = x1;
    let bottomY = y1;
    if (y0 > y1) {
      direction = -1;
      topX = x1;
      topY = y1;
      bottomX = x0;
      bottomY = y0;
    }
    const dxdy = (bottomX - topX) / (bottomY - topY);
    const cells = this.cells;
    const lastRow = Math.min(this.height, Math.ceil(bottomY));
    for (let row = Math.floor(topY); row < lastRow; row++) {
      const rowTop = Math.max(row, topY);
      const rowBottom = Math.min(row + 1, bottomY);
      const dy = rowBottom - rowTop;
      if (dy <= 0) continue;
      const xa = topX + (rowTop - topY) * dxdy;
      const xb = topX + (rowBottom - topY) * dxdy;
      const xl = Math.min(xa, xb);
      const xr = Math.max(xa, xb);
      const d = dy * direction;
      const base = row * this.stride;
      const il = Math.floor(xl);
      if (xr - xl < 1e-9) {
        const fraction = xl - il;
        cells[base + il] = (cells[base + il] ?? 0) + d * (1 - fraction);
        cells[base + il + 1] = (cells[base + il + 1] ?? 0) + d * fraction;
        continue;
      }
      // Pixel c is covered right of the edge by F(c), the average over the row of
      // clamp(c + 1 - x, 0, 1). The cells hold the differences F(c) - F(c - 1).
      const ir = Math.ceil(xr);
      const inverseWidth = 1 / (xr - xl);
      let previous = 0;
      for (let c = il; c <= ir; c++) {
        const f = (rampIntegral(c + 1 - xl) - rampIntegral(c + 1 - xr)) * inverseWidth;
        cells[base + c] = (cells[base + c] ?? 0) + d * (f - previous);
        previous = f;
      }
    }
  }

  /** Sums each row, reports covered pixels, and clears the buffer for the next path. */
  resolve(originX: number, originY: number, visit: CoverageVisitor): Rect {
    const cells = this.cells;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let row = 0; row < this.height; row++) {
      const base = row * this.stride;
      let sum = 0;
      for (let c = 0; c < this.width; c++) {
        sum += cells[base + c] ?? 0;
        cells[base + c] = 0;
        const amount = sum < 0 ? -sum : sum;
        const coverage = amount >= 1 ? 255 : Math.round(amount * 255);
        if (coverage === 0) continue;
        visit(originX + c, originY + row, coverage);
        if (c < minX) minX = c;
        if (c > maxX) maxX = c;
        if (row < minY) minY = row;
        maxY = row;
      }
      cells[base + this.width] = 0;
      cells[base + this.width + 1] = 0;
    }
    if (minX > maxX) return EMPTY_RECT;
    return { x: originX + minX, y: originY + minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
}

/** The pixel rectangle a path can touch, limited to clip. */
export function pathRect(path: Path, clip: Rect): Rect {
  const bounds = path.bounds();
  if (bounds === null) return EMPTY_RECT;
  return intersectRect(rectFromBounds(bounds.x0, bounds.y0, bounds.x1, bounds.y1), clip);
}

/** Visits every pixel inside clip that the path covers, and returns the rectangle it visited. */
export function rasterizePath(path: Path, clip: Rect, visit: CoverageVisitor): Rect {
  const area = pathRect(path, clip);
  if (isEmptyRect(area)) return EMPTY_RECT;
  const accumulator = new Accumulator(area.width, area.height);
  for (const contour of path.contours) {
    const n = contour.length;
    if (n < 6) continue;
    for (let i = 0; i + 1 < n; i += 2) {
      const j = (i + 2) % n;
      accumulator.addEdge(
        (contour[i] ?? 0) - area.x,
        (contour[i + 1] ?? 0) - area.y,
        (contour[j] ?? 0) - area.x,
        (contour[j + 1] ?? 0) - area.y,
      );
    }
  }
  return accumulator.resolve(area.x, area.y, visit);
}

/** Fills a path with one color, blended over the surface. Returns the changed rectangle. */
export function fillPath(surface: Surface, path: Path, color: Color, clip?: Rect): Rect {
  const bounds = clip ?? { x: 0, y: 0, width: surface.width, height: surface.height };
  const data = surface.data;
  const width = surface.width;
  return rasterizePath(path, bounds, (x, y, coverage) => {
    blendPixel(data, (y * width + x) * 4, color.r, color.g, color.b, div255(color.a * coverage));
  });
}

/** Adds a closed polygon to the path with positive winding, whatever order its points came in. */
function addWound(path: Path, points: number[]): void {
  if (signedArea(points) < 0) {
    const reversed: number[] = [];
    for (let i = points.length - 2; i >= 0; i -= 2) reversed.push(points[i] ?? 0, points[i + 1] ?? 0);
    path.polygon(reversed);
  } else {
    path.polygon(points);
  }
}

/**
 * Adds the outline of a polyline to a path: a rectangle along each segment and a disc at each
 * point, which gives round joins and round caps. Every piece has the same winding, so the
 * clamped nonzero rule merges the overlaps into one solid outline.
 */
export function strokePolyline(path: Path, points: readonly number[], width: number, closed: boolean): Path {
  const radius = width / 2;
  if (radius <= 0 || points.length < 2) return path;
  const count = points.length / 2;
  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i++) {
    const x0 = points[2 * i] ?? 0;
    const y0 = points[2 * i + 1] ?? 0;
    const x1 = points[(2 * i + 2) % points.length] ?? 0;
    const y1 = points[(2 * i + 3) % points.length] ?? 0;
    const length = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    if (length === 0) continue;
    const nx = (-(y1 - y0) / length) * radius;
    const ny = ((x1 - x0) / length) * radius;
    addWound(path, [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]);
  }
  // A disc at every end and at every corner sharp enough to leave a gap between two rectangles.
  // On a gentle bend the gap is far below a pixel, and a smooth curve has hundreds of those.
  for (let i = 0; i < count; i++) {
    const x = points[2 * i] ?? 0;
    const y = points[2 * i + 1] ?? 0;
    const isEnd = !closed && (i === 0 || i === count - 1);
    if (isEnd || isSharpCorner(points, i, count)) path.ellipse(x, y, radius, radius, 1);
  }
  return path;
}

function isSharpCorner(points: readonly number[], i: number, count: number): boolean {
  const prev = (i - 1 + count) % count;
  const next = (i + 1) % count;
  const ax = (points[2 * i] ?? 0) - (points[2 * prev] ?? 0);
  const ay = (points[2 * i + 1] ?? 0) - (points[2 * prev + 1] ?? 0);
  const bx = (points[2 * next] ?? 0) - (points[2 * i] ?? 0);
  const by = (points[2 * next + 1] ?? 0) - (points[2 * i + 1] ?? 0);
  const lengths = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
  if (lengths === 0) return true;
  // cos of the turn below 0.995 is a turn of more than about 5.7 degrees.
  return (ax * bx + ay * by) / lengths < 0.995;
}
