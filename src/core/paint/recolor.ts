import type { Color } from './color.ts';
import { DabCanvas, discCoverage, trailStroke } from './dab.ts';
import { EMPTY_RECT } from './rect.ts';
import type { StrokeContext, ToolStroke } from './types.ts';

/**
 * Changes one pixel's color for a color effect. pixel holds red, green, blue, and alpha from
 * before the stroke, 0 to 255. The map writes the new red, green, and blue into pixel[0..2] and
 * leaves alpha alone. x and y say where the pixel is, for maps that look at its neighbors.
 */
export type PixelMap = (pixel: number[], x: number, y: number) => void;

/** Distance between dabs as a fraction of the size. Small, so the edge of the stroke stays smooth. */
const SPACING = 0.1;

/**
 * A brush-like stroke that maps the color of every pixel it covers. Each pixel is mapped once per
 * stroke from its color before the stroke, however often the stroke crosses it, so a map that
 * is not idempotent, like inverting, does not flip back. The edge is antialiased, and fully
 * transparent pixels stay as they are.
 */
export function recolorStroke(ctx: StrokeContext, map: PixelMap): ToolStroke {
  const canvas = new DabCanvas(ctx.doc, ctx.change);
  const pixel = [0, 0, 0, 0];
  let previousX = Number.NaN;
  let previousY = Number.NaN;
  return trailStroke(
    ctx,
    ctx.settings.size * SPACING,
    (dab) => {
      const radius = dab.size / 2;
      if (!(radius > 0)) return EMPTY_RECT;
      const reach = radius + 1;
      const firstRow = Math.max(0, Math.floor(dab.y - reach));
      const lastRow = Math.min(canvas.height - 1, Math.ceil(dab.y + reach));
      for (let y = firstRow; y <= lastRow; y++) {
        const dy = y + 0.5 - dab.y;
        const room = reach * reach - dy * dy;
        if (room < 0) continue;
        const half = Math.sqrt(room);
        const firstColumn = Math.max(0, Math.floor(dab.x - half));
        const lastColumn = Math.min(canvas.width - 1, Math.ceil(dab.x + half));
        for (let x = firstColumn; x <= lastColumn; x++) {
          const dx = x + 0.5 - dab.x;
          const coverage = discCoverage(radius, Math.sqrt(dx * dx + dy * dy));
          if (coverage <= 0) continue;
          // The previous dab already mapped this pixel at full coverage, and nothing can raise it.
          const px = x + 0.5 - previousX;
          const py = y + 0.5 - previousY;
          if (discCoverage(radius, Math.sqrt(px * px + py * py)) === 255) continue;
          canvas.readBefore(x, y, pixel);
          // A transparent pixel has no color to change, and painting it would make it show.
          if (pixel[3] === 0) continue;
          map(pixel, x, y);
          canvas.put(x, y, coverage, pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
        }
      }
      previousX = dab.x;
      previousY = dab.y;
      return canvas.takeChanged();
    },
    () => canvas.finish(),
  );
}

/**
 * How light a color looks, 0 to 255, with the weights of broadcast video. Green looks lightest
 * and blue darkest. The weights add up to 256, so white stays 255.
 */
export function luma(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/** A color at a lightness from 0 to 255. */
type ToneStop = readonly [lightness: number, color: Color];

/**
 * A lookup table from lightness to color: red, green, and blue for each lightness 0 to 255, at
 * index lightness * 3. Colors blend in a straight line between stops. The first stop is at
 * lightness 0, the last at 255, and each one is lighter than the one before.
 */
export function toneRamp(stops: readonly [ToneStop, ...ToneStop[]]): Uint8Array {
  const table = new Uint8Array(256 * 3);
  let [[from, low]] = stops;
  for (const [to, high] of stops.slice(1)) {
    for (let l = from; l <= to; l++) {
      const t = (l - from) / (to - from);
      table[l * 3] = Math.round(low.r + (high.r - low.r) * t);
      table[l * 3 + 1] = Math.round(low.g + (high.g - low.g) * t);
      table[l * 3 + 2] = Math.round(low.b + (high.b - low.b) * t);
    }
    from = to;
    low = high;
  }
  return table;
}
