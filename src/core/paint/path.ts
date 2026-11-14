import { cos, hypot, sin, TAU } from './math.ts';

/**
 * A path made of closed polygons. Curves are flattened into short line segments as they are
 * added, so the filler only ever sees straight edges. Each contour is a flat list of
 * coordinates: x0, y0, x1, y1, and so on. Contours are closed implicitly.
 */
export class Path {
  readonly contours: number[][] = [];
  private current: number[] | null = null;
  /** The largest distance, in pixels, between a curve and the segments that replace it. */
  readonly tolerance: number;

  constructor(tolerance = 0.2) {
    this.tolerance = tolerance;
  }

  moveTo(x: number, y: number): this {
    this.current = [x, y];
    this.contours.push(this.current);
    return this;
  }

  lineTo(x: number, y: number): this {
    if (this.current === null) return this.moveTo(x, y);
    this.current.push(x, y);
    return this;
  }

  quadTo(cx: number, cy: number, x: number, y: number): this {
    const [x0, y0] = this.lastPoint();
    // A quadratic flattened into n segments strays at most |p0 - 2 p1 + p2| / (8 n^2).
    const n = segmentCount(hypot(x0 - 2 * cx + x, y0 - 2 * cy + y) / (8 * this.tolerance));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
    }
    return this;
  }

  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    const [x0, y0] = this.lastPoint();
    const dd = Math.max(hypot(x0 - 2 * c1x + c2x, y0 - 2 * c1y + c2y), hypot(c1x - 2 * c2x + x, c1y - 2 * c2y + y));
    const n = segmentCount((3 * dd) / (4 * this.tolerance));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.lineTo(a * x0 + b * c1x + c * c2x + d * x, a * y0 + b * c1y + c * c2y + d * y);
    }
    return this;
  }

  /** Adds a whole ellipse as its own contour, counterclockwise on screen when sweep is 1. */
  ellipse(cx: number, cy: number, rx: number, ry: number, sweep: 1 | -1 = 1): this {
    const n = ellipseSegments(Math.max(Math.abs(rx), Math.abs(ry)), this.tolerance);
    this.moveTo(cx + rx, cy);
    for (let i = 1; i < n; i++) {
      const angle = (sweep * TAU * i) / n;
      this.lineTo(cx + rx * cos(angle), cy + ry * sin(angle));
    }
    return this.close();
  }

  /** Adds a closed polygon from a flat list of coordinates. */
  polygon(points: readonly number[]): this {
    if (points.length < 2) return this;
    this.moveTo(points[0] ?? 0, points[1] ?? 0);
    for (let i = 2; i + 1 < points.length; i += 2) this.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
    return this.close();
  }

  close(): this {
    this.current = null;
    return this;
  }

  /** Bounds of every point, or null for an empty path. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const contour of this.contours) {
      for (let i = 0; i + 1 < contour.length; i += 2) {
        const x = contour[i] ?? 0;
        const y = contour[i + 1] ?? 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x0 <= x1 ? { x0, y0, x1, y1 } : null;
  }

  /** A copy with every point moved by a 2D affine transform: x' = a x + c y + e, y' = b x + d y + f. */
  transform(a: number, b: number, c: number, d: number, e: number, f: number): Path {
    const result = new Path(this.tolerance);
    for (const contour of this.contours) {
      const moved: number[] = [];
      for (let i = 0; i + 1 < contour.length; i += 2) {
        const x = contour[i] ?? 0;
        const y = contour[i + 1] ?? 0;
        moved.push(a * x + c * y + e, b * x + d * y + f);
      }
      result.contours.push(moved);
    }
    return result;
  }

  private lastPoint(): [number, number] {
    const contour = this.current;
    if (contour === null || contour.length < 2) return [0, 0];
    return [contour[contour.length - 2] ?? 0, contour[contour.length - 1] ?? 0];
  }
}

function segmentCount(squared: number): number {
  return Math.min(256, Math.max(1, Math.ceil(Math.sqrt(squared))));
}

/** Segments so that the chord of each one strays at most tolerance from a circle of this radius. */
export function ellipseSegments(radius: number, tolerance: number): number {
  if (radius <= tolerance) return 8;
  // The sagitta of a chord spanning angle theta is about r theta^2 / 8.
  const step = Math.sqrt((8 * tolerance) / radius);
  return Math.min(1024, Math.max(8, Math.ceil(TAU / step)));
}

/**
 * The signed area of a contour. Positive means clockwise on screen, where y points down.
 * The stroker uses it to give every piece of an outline the same winding.
 */
export function signedArea(contour: readonly number[]): number {
  let area = 0;
  const n = contour.length;
  for (let i = 0; i + 1 < n; i += 2) {
    const x0 = contour[i] ?? 0;
    const y0 = contour[i + 1] ?? 0;
    const x1 = contour[(i + 2) % n] ?? 0;
    const y1 = contour[(i + 3) % n] ?? 0;
    area += x0 * y1 - x1 * y0;
  }
  return area / 2;
}
