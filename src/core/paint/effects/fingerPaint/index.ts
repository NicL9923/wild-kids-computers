import { trailStroke } from '../../dab.ts';
import { clipRect, EMPTY_RECT, isEmptyRect } from '../../rect.ts';
import { defineEffect } from '../../types.ts';

/** Distance between dabs as a fraction of the size. */
const SPACING = 0.1;
/** How much of the carried paint the middle of the finger leaves on the picture per dab. */
const LEAVE = 0.8;
/** How much of the picture under the finger, before this dab, the carried paint takes on per dab. Lower drags paint farther. */
const PICK_UP = 0.3;

/**
 * Smears paint along the stroke like a wet finger. The finger picks up the colors where the
 * stroke starts, leaves them along the way, and slowly takes on the colors it passes.
 */
export default defineEffect({
  id: 'fingerPaint',
  order: 2,
  group: 'distort',
  stroke: (ctx) => {
    const { doc, change } = ctx;
    // The paint on the finger: how much there is, 0 to 1, and red, green, and blue multiplied by
    // that amount, so a cell that starts off the canvas with no paint takes on color, not black.
    const side = Math.ceil(ctx.settings.size) + 2;
    const carried = new Float32Array(side * side * 4);
    const data = doc.paint.data;
    let wet = false;
    return trailStroke(ctx, ctx.settings.size * SPACING, (dab) => {
      const radius = dab.size / 2;
      if (!(radius > 0)) return EMPTY_RECT;
      // Finger cell (i, j) lies over picture pixel (left + i, top + j).
      const left = Math.round(dab.x - side / 2);
      const top = Math.round(dab.y - side / 2);
      const area = clipRect({ x: left, y: top, width: side, height: side }, doc.width, doc.height);
      if (!wet) {
        // The first dab only dips the finger. Cells off the canvas carry no paint.
        wet = true;
        for (let y = area.y; y < area.y + area.height; y++) {
          for (let x = area.x; x < area.x + area.width; x++) {
            const i = (y * doc.width + x) * 4;
            const c = ((y - top) * side + (x - left)) * 4;
            const amount = (data[i + 3] ?? 0) / 255;
            carried[c] = (data[i] ?? 0) * amount;
            carried[c + 1] = (data[i + 1] ?? 0) * amount;
            carried[c + 2] = (data[i + 2] ?? 0) * amount;
            carried[c + 3] = amount;
          }
        }
        return EMPTY_RECT;
      }
      if (isEmptyRect(area)) return EMPTY_RECT;
      change.touch(area);
      for (let y = area.y; y < area.y + area.height; y++) {
        const dy = y + 0.5 - dab.y;
        for (let x = area.x; x < area.x + area.width; x++) {
          const dx = x + 0.5 - dab.x;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= radius) continue;
          const i = (y * doc.width + x) * 4;
          const alpha = data[i + 3] ?? 0;
          // A transparent pixel has no paint to smear into.
          if (alpha === 0) continue;
          const c = ((y - top) * side + (x - left)) * 4;
          const amount = carried[c + 3] ?? 0;
          const t = 1 - distance / radius;
          const leave = LEAVE * t * t * (3 - 2 * t) * amount;
          const opacity = alpha / 255;
          for (let k = 0; k < 3; k++) {
            const here = data[i + k] ?? 0;
            const smeared = leave > 0 ? Math.round(here + ((carried[c + k] ?? 0) / amount - here) * leave) : here;
            data[i + k] = smeared;
            carried[c + k] = (carried[c + k] ?? 0) + (here * opacity - (carried[c + k] ?? 0)) * PICK_UP;
          }
          carried[c + 3] = amount + (opacity - amount) * PICK_UP;
        }
      }
      return area;
    });
  },
});
