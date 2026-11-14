import { blendPixel, div255, type Color } from './color.ts';
import type { PaintDocument } from './document.ts';
import type { Change } from './history.ts';
import type { Path } from './path.ts';
import { pathRect, rasterizePath, rasterizeStroke } from './raster.ts';
import { clipRect, EMPTY_RECT, rectFromBounds, unionRect, type Rect } from './rect.ts';

/**
 * Drawing for paint-on effects that scatter little things, such as bubbles, leaves, or snow.
 *
 * A brush tip paints through a DabCanvas, where a pixel keeps its highest coverage in a stroke.
 * That is right for a smooth line and wrong for things that sit on top of each other: a bubble's
 * shine would erase the bubble under it. A Scatter blends every piece over what is already there
 * instead, so pieces stack the way stickers do. It touches each area before it writes, so undo
 * and cancel put every pixel back.
 */
export class Scatter {
  private readonly doc: PaintDocument;
  private readonly change: Change;
  private readonly clip: Rect;
  private changed: Rect = EMPTY_RECT;

  constructor(doc: PaintDocument, change: Change) {
    this.doc = doc;
    this.change = change;
    this.clip = { x: 0, y: 0, width: doc.width, height: doc.height };
  }

  /** Fills a path with color, blended over the picture. */
  fill(path: Path, color: Color): void {
    const area = pathRect(path, this.clip);
    this.change.touch(area);
    const { data, width } = this.doc.paint;
    const { r, g, b, a } = color;
    this.grow(
      rasterizePath(path, area, (x, y, coverage) =>
        blendPixel(data, (y * width + x) * 4, r, g, b, div255(a * coverage)),
      ),
    );
  }

  /** Draws polylines width pixels wide with round ends, blended over the picture. */
  line(polylines: readonly (readonly number[])[], width: number, color: Color): void {
    const reach = width / 2 + 1;
    let area = EMPTY_RECT;
    for (const points of polylines) {
      for (let i = 0; i + 1 < points.length; i += 2) {
        const x = points[i] ?? 0;
        const y = points[i + 1] ?? 0;
        const dot = rectFromBounds(x - reach, y - reach, x + reach, y + reach);
        area = unionRect(area, dot);
      }
    }
    // Clip to the picture: the stroker visits every pixel inside the area it is given.
    area = clipRect(area, this.doc.width, this.doc.height);
    this.change.touch(area);
    const { data, width: stride } = this.doc.paint;
    const { r, g, b, a } = color;
    this.grow(
      rasterizeStroke(polylines, width, false, area, (x, y, coverage) =>
        blendPixel(data, (y * stride + x) * 4, r, g, b, div255(a * coverage)),
      ),
    );
  }

  /**
   * Blends a round spot whose opacity, 0 to 255, depends on the distance from its center. A glow
   * fades out with distance; a ring is opaque only near its radius.
   */
  spot(cx: number, cy: number, radius: number, opacity: (distance: number) => number, color: Color): void {
    const reach = radius + 1;
    const area = clipRect(
      rectFromBounds(cx - reach, cy - reach, cx + reach, cy + reach),
      this.doc.width,
      this.doc.height,
    );
    this.change.touch(area);
    const { data, width } = this.doc.paint;
    const { r, g, b, a } = color;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let y = area.y; y < area.y + area.height; y++) {
      const dy = y + 0.5 - cy;
      for (let x = area.x; x < area.x + area.width; x++) {
        const dx = x + 0.5 - cx;
        const squared = dx * dx + dy * dy;
        if (squared > reach * reach) continue;
        const amount = opacity(Math.sqrt(squared));
        if (amount <= 0) continue;
        blendPixel(data, (y * width + x) * 4, r, g, b, div255(a * Math.min(255, Math.round(amount))));
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
    if (minX <= maxX) this.grow({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }

  /** The rectangle written since the last call. */
  takeChanged(): Rect {
    const rect = this.changed;
    this.changed = EMPTY_RECT;
    return rect;
  }

  private grow(rect: Rect): void {
    this.changed = unionRect(this.changed, rect);
  }
}
