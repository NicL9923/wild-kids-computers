import { blendPixel, div255, type Color } from './color.ts';
import type { Path } from './path.ts';
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

/**
 * Visits every pixel within width / 2 of any of the polylines, with antialiased coverage from
 * its distance to the nearest point on them. Ends and corners come out round. The distance is
 * a minimum over all segments, so where segments overlap the union is exact: no seams at the
 * joints and no doubled edges. A polyline with one point is a dot.
 */
export function rasterizeStroke(
  polylines: readonly (readonly number[])[],
  width: number,
  closed: boolean,
  clip: Rect,
  visit: CoverageVisitor,
): Rect {
  const radius = width / 2;
  if (!(radius > 0)) return EMPTY_RECT;
  const area = strokeRect(polylines, radius, clip);
  if (isEmptyRect(area)) return EMPTY_RECT;
  const size = area.width * area.height;
  if (distanceScratch.length < size) distanceScratch = new Float64Array(size);
  const nearest = distanceScratch;
  nearest.fill(Number.POSITIVE_INFINITY, 0, size);
  const reach = radius + 1;
  for (const points of polylines) {
    const count = Math.floor(points.length / 2);
    if (count === 0) continue;
    const segments = count === 1 ? 1 : closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % count;
      markSegment(
        nearest,
        area,
        points[2 * i] ?? 0,
        points[2 * i + 1] ?? 0,
        points[2 * j] ?? 0,
        points[2 * j + 1] ?? 0,
        reach,
      );
    }
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < area.height; row++) {
    for (let column = 0; column < area.width; column++) {
      const squared = nearest[row * area.width + column] ?? Number.POSITIVE_INFINITY;
      if (squared >= reach * reach) continue;
      const amount = radius - Math.sqrt(squared) + 0.5;
      if (amount <= 0) continue;
      const coverage = amount >= 1 ? 255 : Math.round(amount * 255);
      if (coverage === 0) continue;
      visit(area.x + column, area.y + row, coverage);
      if (column < minX) minX = column;
      if (column > maxX) maxX = column;
      if (row < minY) minY = row;
      maxY = row;
    }
  }
  if (minX > maxX) return EMPTY_RECT;
  return { x: area.x + minX, y: area.y + minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

let distanceScratch = new Float64Array(0);

/** The pixel rectangle a stroke of this radius can touch, limited to clip. */
export function strokeRect(polylines: readonly (readonly number[])[], radius: number, clip: Rect): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const points of polylines) {
    for (let i = 0; i + 1 < points.length; i += 2) {
      x0 = Math.min(x0, points[i] ?? 0);
      x1 = Math.max(x1, points[i] ?? 0);
      y0 = Math.min(y0, points[i + 1] ?? 0);
      y1 = Math.max(y1, points[i + 1] ?? 0);
    }
  }
  if (x0 > x1) return EMPTY_RECT;
  const reach = radius + 1;
  return intersectRect(rectFromBounds(x0 - reach, y0 - reach, x1 + reach, y1 + reach), clip);
}

/** Lowers the squared distance of each pixel center near one segment, row by row within reach. */
function markSegment(
  nearest: Float64Array,
  area: Rect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  const firstRow = Math.max(area.y, Math.floor(Math.min(y0, y1) - reach));
  const lastRow = Math.min(area.y + area.height - 1, Math.ceil(Math.max(y0, y1) + reach));
  for (let y = firstRow; y <= lastRow; y++) {
    const py = y + 0.5;
    // The part of the segment within reach of this row lies between these x values.
    let low = Math.min(x0, x1);
    let high = Math.max(x0, x1);
    if (dy !== 0) {
      const ta = Math.min(1, Math.max(0, (py - reach - y0) / dy));
      const tb = Math.min(1, Math.max(0, (py + reach - y0) / dy));
      low = Math.min(x0 + dx * ta, x0 + dx * tb);
      high = Math.max(x0 + dx * ta, x0 + dx * tb);
    }
    const firstColumn = Math.max(area.x, Math.floor(low - reach));
    const lastColumn = Math.min(area.x + area.width - 1, Math.ceil(high + reach));
    const rowBase = (y - area.y) * area.width - area.x;
    for (let x = firstColumn; x <= lastColumn; x++) {
      const px = x + 0.5;
      let t = lengthSquared === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / lengthSquared;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ex = px - (x0 + dx * t);
      const ey = py - (y0 + dy * t);
      const squared = ex * ex + ey * ey;
      if (squared < (nearest[rowBase + x] ?? Number.POSITIVE_INFINITY)) nearest[rowBase + x] = squared;
    }
  }
}
