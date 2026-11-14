import { tileOffset } from '../../history.ts';
import { recolorStroke } from '../../recolor.ts';
import { defineEffect } from '../../types.ts';

/** The side of a block as a fraction of the size, and at least MIN_BLOCK pixels. */
const BLOCK = 0.1;
const MIN_BLOCK = 4;
/** Marks a block whose color is not worked out yet. */
const UNKNOWN = -1;

/**
 * Turns the picture under the brush into big square blocks, each the average color of the
 * picture under it. The blocks sit on one grid over the whole canvas, so strokes that meet line
 * up.
 */
export default defineEffect({
  id: 'chunky',
  order: 8,
  group: 'distort',
  stroke: (ctx) => {
    const { doc, change } = ctx;
    const block = Math.max(MIN_BLOCK, Math.round(ctx.settings.size * BLOCK));
    const columns = Math.ceil(doc.width / block);
    const rows = Math.ceil(doc.height / block);
    // Block colors as 0xRRGGBB, worked out from the picture before the stroke on first use.
    const colors = new Int32Array(columns * rows).fill(UNKNOWN);
    const average = (column: number, row: number): number => {
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      const right = Math.min(doc.width, (column + 1) * block);
      const bottom = Math.min(doc.height, (row + 1) * block);
      for (let y = row * block; y < bottom; y++) {
        for (let x = column * block; x < right; x++) {
          const before = change.tileAt(x, y);
          const t = tileOffset(x, y);
          const alpha = before[t + 3] ?? 0;
          red += (before[t] ?? 0) * alpha;
          green += (before[t + 1] ?? 0) * alpha;
          blue += (before[t + 2] ?? 0) * alpha;
          weight += alpha;
        }
      }
      // recolorStroke skips transparent pixels, so a block it asks about has weight.
      return (Math.round(red / weight) << 16) | (Math.round(green / weight) << 8) | Math.round(blue / weight);
    };
    return recolorStroke(ctx, (pixel, x, y) => {
      const column = Math.floor(x / block);
      const row = Math.floor(y / block);
      const index = row * columns + column;
      let color = colors[index] ?? UNKNOWN;
      if (color === UNKNOWN) {
        color = average(column, row);
        colors[index] = color;
      }
      pixel[0] = (color >> 16) & 255;
      pixel[1] = (color >> 8) & 255;
      pixel[2] = color & 255;
    });
  },
});
