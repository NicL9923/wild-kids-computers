import { blendPixel } from '../../color.ts';
import { cos, degreesToRadians, sin } from '../../math.ts';
import { clipRect, EMPTY_RECT, rectFromBounds, type Rect } from '../../rect.ts';
import { sampleBilinear } from '../../sample.ts';
import type { Surface } from '../../surface.ts';
import { downscale } from '../../thumbnail.ts';
import type { StampSettings } from '../../types.ts';

/** Cosine and sine of a rotation in degrees, exact at quarter turns so a square stamp stays crisp. */
function turn(degrees: number): { c: number; s: number } {
  const quarter = ((degrees % 360) + 360) % 360;
  if (quarter === 0) return { c: 1, s: 0 };
  if (quarter === 90) return { c: 0, s: 1 };
  if (quarter === 180) return { c: -1, s: 0 };
  if (quarter === 270) return { c: 0, s: -1 };
  const radians = degreesToRadians(degrees);
  return { c: cos(radians), s: sin(radians) };
}

/**
 * The stamp bitmap at the size it will be drawn. A stamp drawn smaller than its bitmap is
 * averaged down first, because bilinear sampling alone would skip pixels and shimmer.
 */
export function sizedBitmap(bitmap: Surface, size: number): { source: Surface; scale: number } {
  const scale = size / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return { source: bitmap, scale };
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const source = downscale(bitmap, width, height);
  return { source, scale: size / Math.max(width, height) };
}

/**
 * Draws a sized stamp centered at (cx, cy), flipped and then rotated clockwise. Returns the
 * rectangle it may have changed. touch is called with that rectangle before any pixel changes.
 */
export function placeStamp(
  target: Surface,
  source: Surface,
  scale: number,
  stamp: Pick<StampSettings, 'rotation' | 'flipX' | 'flipY'>,
  cx: number,
  cy: number,
  touch: (rect: Rect) => void,
): Rect {
  const { c, s } = turn(stamp.rotation);
  const halfWidth = (source.width * scale) / 2;
  const halfHeight = (source.height * scale) / 2;
  const reachX = Math.abs(halfWidth * c) + Math.abs(halfHeight * s) + 1;
  const reachY = Math.abs(halfWidth * s) + Math.abs(halfHeight * c) + 1;
  const area = clipRect(
    rectFromBounds(cx - reachX, cy - reachY, cx + reachX, cy + reachY),
    target.width,
    target.height,
  );
  if (area.width <= 0 || area.height <= 0) return EMPTY_RECT;
  touch(area);
  const sample = new Float64Array(4);
  const flipX = stamp.flipX ? -1 : 1;
  const flipY = stamp.flipY ? -1 : 1;
  const data = target.data;
  for (let y = area.y; y < area.y + area.height; y++) {
    const dy = y + 0.5 - cy;
    for (let x = area.x; x < area.x + area.width; x++) {
      const dx = x + 0.5 - cx;
      // Undo the rotation, then the flip, then the scale, to find the source point.
      const u = ((dx * c + dy * s) * flipX) / scale;
      const v = ((dy * c - dx * s) * flipY) / scale;
      sampleBilinear(source, u + source.width / 2 - 0.5, v + source.height / 2 - 0.5, sample);
      const alpha = sample[3] ?? 0;
      if (alpha < 0.5) continue;
      const unpremultiply = 255 / alpha;
      blendPixel(
        data,
        (y * target.width + x) * 4,
        Math.round((sample[0] ?? 0) * unpremultiply),
        Math.round((sample[1] ?? 0) * unpremultiply),
        Math.round((sample[2] ?? 0) * unpremultiply),
        Math.round(alpha),
      );
    }
  }
  return area;
}
