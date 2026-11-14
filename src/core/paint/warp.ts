import { blendPixel } from './color.ts';
import type { PaintDocument } from './document.ts';
import type { Change } from './history.ts';
import { clipRect, EMPTY_RECT, growRect, isEmptyRect, rectFromBounds, type Rect } from './rect.ts';
import { createSurface, type Surface } from './surface.ts';

/**
 * Where one pixel of a warped dab reads from. It gets the pixel center's offset (dx, dy) from the
 * dab center and its distance, which is under the radius, and writes the offset to read from
 * into from[0] and from[1]. It may write a light in from[2]: above 0 lightens toward white,
 * below 0 darkens toward black, and -1 to 1 spans black to white. It returns false to leave the
 * pixel as it is.
 */
export type WarpSource = (dx: number, dy: number, distance: number, from: Float64Array) => boolean;

/** One dab of a distort effect, centered on (x, y). reach is how far outside the disc a source point can land. */
export interface WarpDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly reach: number;
}

/**
 * Moves the pixels under one dab of a distort effect. Each pixel inside the radius takes the color
 * at its source point, sampled bilinearly from a copy of the area as it was before this dab, so
 * no pixel moves twice in one dab. Source points are clamped to the canvas, so a warp at the edge
 * pulls in edge pixels rather than nothing, and transparent samples change nothing.
 * Returns the rectangle it may have changed.
 */
export function warpDab(doc: PaintDocument, change: Change, dab: WarpDab, sourceOf: WarpSource): Rect {
  const { x: cx, y: cy, radius } = dab;
  const area = clipRect(rectFromBounds(cx - radius, cy - radius, cx + radius, cy + radius), doc.width, doc.height);
  if (isEmptyRect(area)) return EMPTY_RECT;
  const copyArea = clipRect(growRect(area, Math.ceil(dab.reach) + 1), doc.width, doc.height);
  const copy = copyOf(doc.paint, copyArea);
  change.touch(area);
  const maxX = copyArea.width - 1;
  const maxY = copyArea.height - 1;
  const from = new Float64Array(3);
  const pixels = copy.data;
  const rowBytes = copyArea.width * 4;
  const data = doc.paint.data;
  const radiusSquared = radius * radius;
  for (let y = area.y; y < area.y + area.height; y++) {
    const dy = y + 0.5 - cy;
    for (let x = area.x; x < area.x + area.width; x++) {
      const dx = x + 0.5 - cx;
      const squared = dx * dx + dy * dy;
      if (squared >= radiusSquared) continue;
      from[2] = 0;
      if (!sourceOf(dx, dy, Math.sqrt(squared), from)) continue;
      // Pixel centers sit at whole coordinates in the copy.
      const sx = Math.min(maxX, Math.max(0, cx + (from[0] ?? 0) - 0.5 - copyArea.x));
      const sy = Math.min(maxY, Math.max(0, cy + (from[1] ?? 0) - 0.5 - copyArea.y));
      // Bilinear, premultiplied, inlined: this runs for every pixel under every dab.
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      // On the last column or row the clamp makes fx or fy exactly 0, so the neighbor past it,
      // the next row's first pixel or nothing at all, gets no weight.
      const i00 = (y0 * copyArea.width + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + rowBytes;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy) * (pixels[i00 + 3] ?? 0);
      const w10 = fx * (1 - fy) * (pixels[i10 + 3] ?? 0);
      const w01 = (1 - fx) * fy * (pixels[i01 + 3] ?? 0);
      const w11 = fx * fy * (pixels[i11 + 3] ?? 0);
      const alpha = w00 + w10 + w01 + w11;
      if (alpha < 0.5) continue;
      const k = 1 / alpha;
      const r =
        ((pixels[i00] ?? 0) * w00 + (pixels[i10] ?? 0) * w10 + (pixels[i01] ?? 0) * w01 + (pixels[i11] ?? 0) * w11) * k;
      const g =
        ((pixels[i00 + 1] ?? 0) * w00 +
          (pixels[i10 + 1] ?? 0) * w10 +
          (pixels[i01 + 1] ?? 0) * w01 +
          (pixels[i11 + 1] ?? 0) * w11) *
        k;
      const b =
        ((pixels[i00 + 2] ?? 0) * w00 +
          (pixels[i10 + 2] ?? 0) * w10 +
          (pixels[i01 + 2] ?? 0) * w01 +
          (pixels[i11 + 2] ?? 0) * w11) *
        k;
      const light = from[2] ?? 0;
      // Toward white by light, or toward black by -light.
      const target = light > 0 ? 255 : 0;
      const amount = Math.min(1, Math.abs(light));
      blendPixel(
        data,
        (y * doc.width + x) * 4,
        Math.round(r + (target - r) * amount),
        Math.round(g + (target - g) * amount),
        Math.round(b + (target - b) * amount),
        Math.round(alpha),
      );
    }
  }
  return area;
}

/** A copy of one rectangle of a surface. */
export function copyOf(source: Surface, rect: Rect): Surface {
  const copy = createSurface(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * source.width + rect.x) * 4;
    copy.data.set(source.data.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return copy;
}
