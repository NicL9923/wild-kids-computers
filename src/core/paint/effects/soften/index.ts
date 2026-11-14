import { trailStroke } from '../../dab.ts';
import { clipRect, EMPTY_RECT, growRect, isEmptyRect, rectFromBounds } from '../../rect.ts';
import { defineEffect } from '../../types.ts';
import { copyOf } from '../../warp.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.25;
/** The blur reaches this far, as a fraction of the size, and at least MIN_REACH pixels. */
const REACH = 0.05;
const MIN_REACH = 2;

/**
 * Averages each pixel of a width-wide RGBA buffer with its neighbors up to reach away, along rows
 * or along columns. Near the edge it averages only the pixels that exist, so the edge of the
 * canvas does not darken.
 */
function boxBlur(
  source: Float32Array,
  target: Float32Array,
  width: number,
  height: number,
  reach: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const lineStep = horizontal ? width * 4 : 4;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      let count = 0;
      for (let k = 0; k < Math.min(reach, length); k++) {
        sum += source[base + k * step + channel] ?? 0;
        count += 1;
      }
      for (let n = 0; n < length; n++) {
        const enter = n + reach;
        if (enter < length) {
          sum += source[base + enter * step + channel] ?? 0;
          count += 1;
        }
        const leave = n - reach - 1;
        if (leave >= 0) {
          sum -= source[base + leave * step + channel] ?? 0;
          count -= 1;
        }
        target[base + n * step + channel] = sum / count;
      }
    }
  }
}

/** Softens the picture under the brush, like breathing on a window. Going over a spot again softens it more. */
export default defineEffect({
  id: 'soften',
  order: 7,
  group: 'distort',
  stroke: (ctx) => {
    const reach = Math.max(MIN_REACH, Math.round(ctx.settings.size * REACH));
    const { doc, change } = ctx;
    return trailStroke(ctx, ctx.settings.size * SPACING, (dab) => {
      const radius = dab.size / 2;
      if (!(radius > 0)) return EMPTY_RECT;
      const area = clipRect(
        rectFromBounds(dab.x - radius, dab.y - radius, dab.x + radius, dab.y + radius),
        doc.width,
        doc.height,
      );
      if (isEmptyRect(area)) return EMPTY_RECT;
      const copyArea = clipRect(growRect(area, reach), doc.width, doc.height);
      const copy = copyOf(doc.paint, copyArea);
      const { width, height } = copyArea;
      // Premultiplied, so a transparent neighbor does not bleed its hidden color in.
      const sharp = new Float32Array(width * height * 4);
      for (let i = 0; i < sharp.length; i += 4) {
        const alpha = (copy.data[i + 3] ?? 0) / 255;
        sharp[i] = (copy.data[i] ?? 0) * alpha;
        sharp[i + 1] = (copy.data[i + 1] ?? 0) * alpha;
        sharp[i + 2] = (copy.data[i + 2] ?? 0) * alpha;
        sharp[i + 3] = copy.data[i + 3] ?? 0;
      }
      const rows = new Float32Array(sharp.length);
      const blurred = new Float32Array(sharp.length);
      boxBlur(sharp, rows, width, height, reach, true);
      boxBlur(rows, blurred, width, height, reach, false);
      change.touch(area);
      const data = doc.paint.data;
      for (let y = area.y; y < area.y + area.height; y++) {
        const dy = y + 0.5 - dab.y;
        for (let x = area.x; x < area.x + area.width; x++) {
          const dx = x + 0.5 - dab.x;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= radius) continue;
          const t = 1 - distance / radius;
          const amount = t * t * (3 - 2 * t);
          const c = ((y - copyArea.y) * width + (x - copyArea.x)) * 4;
          const alpha = (sharp[c + 3] ?? 0) + ((blurred[c + 3] ?? 0) - (sharp[c + 3] ?? 0)) * amount;
          if (alpha < 0.5) continue;
          const i = (y * doc.width + x) * 4;
          const k = 255 / alpha;
          for (let channel = 0; channel < 3; channel++) {
            const before = sharp[c + channel] ?? 0;
            data[i + channel] = Math.round((before + ((blurred[c + channel] ?? 0) - before) * amount) * k);
          }
          data[i + 3] = Math.round(alpha);
        }
      }
      return area;
    });
  },
});
