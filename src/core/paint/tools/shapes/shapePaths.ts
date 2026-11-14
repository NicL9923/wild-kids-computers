import { cos, sin, TAU } from '../../math.ts';
import { Path } from '../../path.ts';
import type { ShapeKind } from '../../types.ts';

/** The box a shape fills, in document pixels. */
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Maps points given in their own coordinates so that their bounds fill the box. */
function fitPoints(points: readonly number[], box: Box): number[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i] ?? 0);
    maxX = Math.max(maxX, points[i] ?? 0);
    minY = Math.min(minY, points[i + 1] ?? 0);
    maxY = Math.max(maxY, points[i + 1] ?? 0);
  }
  const sx = (box.x1 - box.x0) / (maxX - minX);
  const sy = (box.y1 - box.y0) / (maxY - minY);
  const fitted: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    fitted.push(box.x0 + ((points[i] ?? 0) - minX) * sx, box.y0 + ((points[i + 1] ?? 0) - minY) * sy);
  }
  return fitted;
}

/** Points around a closed polar curve r(angle), starting at the top and going clockwise on screen. */
function polar(count: number, radius: (index: number, angle: number) => number): number[] {
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (TAU * i) / count - TAU / 4;
    const r = radius(i, angle);
    points.push(r * cos(angle), r * sin(angle));
  }
  return points;
}

function heart(box: Box): Path {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const x = (u: number): number => box.x0 + u * w;
  const y = (v: number): number => box.y0 + v * h;
  return new Path()
    .moveTo(x(0.5), y(0.22))
    .cubicTo(x(0.5), y(-0.06), x(0), y(-0.06), x(0), y(0.3))
    .cubicTo(x(0), y(0.6), x(0.3), y(0.78), x(0.5), y(1))
    .cubicTo(x(0.7), y(0.78), x(1), y(0.6), x(1), y(0.3))
    .cubicTo(x(1), y(-0.06), x(0.5), y(-0.06), x(0.5), y(0.22))
    .close();
}

function moon(): number[] {
  // The lit edge is a half circle on the left. The inner edge is half an ellipse that bulges
  // the same way, so the crescent is thick in the middle and pointed at both ends.
  const points: number[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const angle = TAU / 4 + (TAU / 2) * (i / steps);
    points.push(cos(angle), sin(angle));
  }
  for (let i = steps - 1; i > 0; i--) {
    const angle = TAU / 4 + (TAU / 2) * (i / steps);
    points.push(0.45 * cos(angle), sin(angle));
  }
  return points;
}

/** The outline of a shape filling the box. Zero width or height gives a path with no area. */
export function shapePath(kind: ShapeKind, box: Box): Path {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const fit = (points: readonly number[]): Path => new Path().polygon(fitPoints(points, box));
  switch (kind) {
    case 'rectangle':
      return new Path().polygon([box.x0, box.y0, box.x1, box.y0, box.x1, box.y1, box.x0, box.y1]);
    case 'ellipse':
      return new Path().ellipse(cx, cy, (box.x1 - box.x0) / 2, (box.y1 - box.y0) / 2);
    case 'triangle':
      return fit([0.5, 0, 1, 1, 0, 1]);
    case 'diamond':
      return fit([0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]);
    case 'hexagon':
      return fit([0.25, 0, 0.75, 0, 1, 0.5, 0.75, 1, 0.25, 1, 0, 0.5]);
    case 'arrow':
      return fit([0, 0.3, 0.6, 0.3, 0.6, 0, 1, 0.5, 0.6, 1, 0.6, 0.7, 0, 0.7]);
    case 'star':
      return fit(polar(10, (i) => (i % 2 === 0 ? 1 : 0.42)));
    case 'flower':
      return fit(polar(240, (_i, angle) => 0.62 + 0.38 * cos(5 * (angle + TAU / 4))));
    case 'heart':
      return heart(box);
    default:
      return fit(moon());
  }
}
