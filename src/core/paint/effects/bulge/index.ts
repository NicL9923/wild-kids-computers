import { builtMapEffect } from '../../sampleMap.ts';
import { defineEffect } from '../../types.ts';

/** How much the middle grows: a pixel at the center samples this fraction of its distance. */
const CENTER_PULL = 0.3;

/**
 * Puffs up the middle of the picture like looking through a glass ball. Inside the circle each
 * pixel reads from closer to the center, most of all near the middle, so the middle looks big.
 * The edge of the circle reads from itself, so the bulge meets the rest of the picture smoothly.
 */
export default defineEffect(
  builtMapEffect('bulge', 6, (width, height) => {
    const map = new Int32Array(width * height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = 0.48 * Math.min(width, height);
    for (let y = 0, p = 0; y < height; y++) {
      const dy = y + 0.5 - cy;
      for (let x = 0; x < width; x++, p++) {
        const dx = x + 0.5 - cx;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= radius) {
          map[p] = p;
          continue;
        }
        const pull = CENTER_PULL + (1 - CENTER_PULL) * (distance / radius);
        const sx = Math.min(width - 1, Math.max(0, Math.floor(cx + dx * pull)));
        const sy = Math.min(height - 1, Math.max(0, Math.floor(cy + dy * pull)));
        map[p] = sy * width + sx;
      }
    }
    return map;
  }),
);
